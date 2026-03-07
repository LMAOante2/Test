import { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, ref, set, onValue, get } from './firebase.js';

const ESP_IP = '192.168.4.1';

const celsius = document.getElementById("celsius");
const fahrenheit = document.getElementById("fahrenheit");

function convertTemperature(tempC) {
    if (fahrenheit.checked) {
        return {
            value: (tempC * 9/5) + 32,
            unit: "°F"
        };
    }
    return {
        value: tempC,
        unit: "°C"
    };
}

function vibrate() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
        window.Capacitor.Plugins.Haptics.impact({ style: 'MEDIUM' });
    }
}

const savedUnit = localStorage.getItem("tempUnit");

if (savedUnit === "fahrenheit") {
    fahrenheit.checked = true;
    celsius.checked = false;
} else {
    celsius.checked = true;
    fahrenheit.checked = false;
}

celsius.addEventListener("change", () => {
    if (celsius.checked) {
        fahrenheit.checked = false;
        localStorage.setItem("tempUnit", "celsius");
    }
});

fahrenheit.addEventListener("change", () => {
    if (fahrenheit.checked) {
        celsius.checked = false;
        localStorage.setItem("tempUnit", "fahrenheit");
    }
});

const transitionTime = 300;

function hideElement(id) {
  const el = document.getElementById(id);
  if (el && el.style.display !== 'none') {
    el.style.opacity = '0';
    setTimeout(() => {
      el.style.display = 'none';
      el.style.opacity = '1';
    }, transitionTime);
  }
}

function showElement(id, displayStyle = 'block') {
  const el = document.getElementById(id);
  if (el) {
    if (el.style.display === 'none' || el.style.display === '') {
      el.style.display = displayStyle;
      el.style.opacity = '0';
      setTimeout(() => {
        el.style.opacity = '1';
      }, 0);
    } else {
      el.style.opacity = '1';
    }
  }
}

function showMainScreen() {
    hideElement('login-screen');
    hideElement('settings-screen');
    showElement('main-screen');
    hideElement('info-screen');
    showElement('addevicebtn');
    showElement('footer', 'flex');
    document.getElementById('homebtn').classList.add("active");
    document.getElementById('settingsbtn').classList.remove("active");
    loadDevices();
}

function settings() {
    showElement('settings-screen');
    hideElement('login-screen');
    hideElement('main-screen');
    hideElement('info-screen');
    hideElement('addevicebtn');
    document.getElementById('homebtn').classList.remove("active");
    showElement('footer', 'flex');
    document.getElementById('settingsbtn').classList.add("active");
}

function showDeviceInfo(deviceId, deviceName, mac, controllable) {
    hideElement('main-screen');
    hideElement('settings-screen');
    showElement('info-screen');
    hideElement('addevicebtn');
    hideElement('footer');

    document.getElementById('info-device-name').innerHTML = `${deviceName} (${mac}) <i class="fa-solid fa-pencil rename-icon" style="cursor: pointer; margin-left: 10px;" onclick="renameDevice('${deviceId}','${deviceName}','${mac}')"></i>`;

    const sensorP = document.getElementById('info-sensor');
    const controlDiv = document.getElementById('control-section');

    if (controllable) {
        sensorP.style.display = 'none';
        controlDiv.style.display = 'block';
        const stateRef = ref(db, `devices/${deviceId}/control/state`);
        const toggleBtn = document.getElementById('toggle-button');

        onValue(stateRef, (stateSnap) => {
            const state = stateSnap.val();
            toggleBtn.innerText = state ? 'Turn Off' : 'Turn On';
        });

        toggleBtn.onclick = () => {
            get(stateRef).then((snap) => {
                const current = snap.val();
                set(stateRef, !current);
            });
        };
    } else {
        sensorP.style.display = 'block';
        controlDiv.style.display = 'none';
        const dataRef = ref(db, `devices/${deviceId}/sensor`);

        onValue(dataRef, (dataSnapshot) => {
            const sensorData = dataSnapshot.val();

            if (sensorData) {
                const temp = convertTemperature(sensorData.temperature);
                const tempColor = sensorData.temperature >= 23 ? "rgb(219, 12, 12)" : "white";

                let humidityColor = "white";
                if (sensorData.humidity >= 60 || sensorData.humidity <= 20) humidityColor = "blue";

                sensorP.innerHTML = `
                    Temp: <span style="color:${tempColor}; font-weight:bold; font-size:16px;">
                    ${temp.value.toFixed(2)}${temp.unit}</span><br>

                    Hum: <span style="color:${humidityColor}; font-weight:bold; font-size:16px;">
                    ${sensorData.humidity.toFixed(2)}%</span><br>

                    Last: ${new Date(sensorData.timestamp * 1000).toLocaleString()}
                `;
            } else {
                sensorP.innerHTML = 'No sensor data available.';
            }
        });
    }
}

function renameDevice(deviceId, currentName, mac) {
    const newName = prompt("Enter new device name:", currentName);
    if (newName && newName.trim() !== "") {
        const userId = auth.currentUser.uid;
        set(ref(db, `users/${userId}/devices/${deviceId}/name`), newName)
            .then(() => {
                document.getElementById('info-device-name').innerHTML = `${newName} (${mac}) <i class="fa-solid fa-pencil rename-icon" style="cursor: pointer; margin-left: 10px;" onclick="renameDevice('${deviceId}','${newName}','${mac}')"></i>`;
            })
            .catch(error => {
                alert("Error renaming device: " + error.message);
            });
    }
}

function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    signInWithEmailAndPassword(auth, email, password)
        .then(() => showMainScreen())
        .catch((error) => {
            document.getElementById('auth-error').innerText = error.message;
        });
}

function signup() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    createUserWithEmailAndPassword(auth, email, password)
        .then(() => showMainScreen())
        .catch((error) => {
            document.getElementById('auth-error').innerText = error.message;
        });
}

function showAddDeviceForm() {
    showElement('add-device-modal');
}

function hideAddDeviceForm() {
    hideElement('add-device-modal');
}

async function addDevice() {
    const homeSSID = document.getElementById('home-ssid').value;
    const homePassword = document.getElementById('home-password').value;
    const deviceName = document.getElementById('device-name').value || 'My Device';

    try {
        const response = await fetch(`http://${ESP_IP}/data`);
        if (!response.ok) throw new Error('Failed to fetch data');

        const data = await response.json();
        const deviceId = data.mac.replace(/:/g, '');
        const controllable = data.controllable || false;

        const configBody = {
            ssid: homeSSID,
            password: homePassword,
            deviceId: deviceId
        };

        const configResponse = await fetch(`http://${ESP_IP}/configure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configBody)
        });

        if (!configResponse.ok) throw new Error('Config failed');

        const userId = auth.currentUser.uid;

        await set(ref(db, `users/${userId}/devices/${deviceId}`), {
            name: deviceName,
            mac: data.mac,
            added: new Date().toISOString(),
            controllable: controllable
        });

        if (controllable) {
            await set(ref(db, `devices/${deviceId}/control/state`), false);
        }

        hideAddDeviceForm();
        loadDevices();
    } catch (error) {
        document.getElementById('add-error').innerText = error.message;
    }
}

async function loadDevices() {
    const userId = auth.currentUser.uid;
    const devicesRef = ref(db, `users/${userId}/devices`);
    const snapshot = await get(devicesRef);

    const deviceList = document.getElementById('device-list');
    deviceList.innerHTML = '';

    if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
            const deviceId = childSnapshot.key;
            const deviceData = childSnapshot.val();

            const deviceDiv = document.createElement('div');
            deviceDiv.className = 'device-item';

            deviceDiv.innerHTML = `
                <h3>${deviceData.name}</h3>
                <p id="status-${deviceId}"></p>
            `;

            deviceDiv.onclick = () => showDeviceInfo(deviceId, deviceData.name, deviceData.mac, deviceData.controllable);
            deviceList.appendChild(deviceDiv);

            if (deviceData.controllable) {
                const stateRef = ref(db, `devices/${deviceId}/control/state`);
                onValue(stateRef, (stateSnapshot) => {
                    const state = stateSnapshot.val();
                    const statusP = document.getElementById(`status-${deviceId}`);
                    if (statusP) {
                        const stateColor = state ? "green" : "red";
                        statusP.innerHTML = `LED: <span style="color:${stateColor}; font-weight:bold; font-size:16px;">${state ? 'ON' : 'OFF'}</span>`;
                    }
                });
            } else {
                const dataRef = ref(db, `devices/${deviceId}/sensor`);
                onValue(dataRef, (dataSnapshot) => {
                    const sensorData = dataSnapshot.val();
                    const statusP = document.getElementById(`status-${deviceId}`);
                    if (sensorData && statusP) {
                        const temp = convertTemperature(sensorData.temperature);
                        const tempColor = sensorData.temperature >= 23 ? "rgb(219, 12, 12)" : "white";
                        let humidityColor = "white";
                        if (sensorData.humidity >= 60 || sensorData.humidity <= 20) humidityColor = "blue";
                    } else if (statusP) {
                        statusP.innerHTML = 'No sensor data available.';
                    }
                });
            }
        });
    } else {
        deviceList.innerHTML = '<p>No devices added yet.</p>';
    }
}

auth.onAuthStateChanged((user) => {
    if (user) {
        showMainScreen();
    } else {
        showElement('login-screen');
        hideElement('main-screen');
        hideElement('settings-screen');
        hideElement('info-screen');
        hideElement('addevicebtn');
        hideElement('footer');
    }
});

function logout() {
    auth.signOut().then(() => {
        showElement('login-screen');
        hideElement('main-screen');
        hideElement('info-screen');
        hideElement('settings-screen');
        hideElement('addevicebtn');
        hideElement('footer');
    });
}

window.login = login;
window.logout = logout;
window.signup = signup;
window.showAddDeviceForm = showAddDeviceForm;
window.hideAddDeviceForm = hideAddDeviceForm;
window.addDevice = addDevice;
window.showMainScreen = showMainScreen;
window.settings = settings;
window.renameDevice = renameDevice;

const eye = document.querySelector('.toggle-password');
const passwordInput = document.getElementById('home-password');

eye.addEventListener('click', () => {
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eye.classList.remove('fa-eye');
        eye.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        eye.classList.remove('fa-eye-slash');
        eye.classList.add('fa-eye');
    }
});

let ptrStartY = 0;
let ptrReady = false;
let ptrTriggered = false;

const ptr = document.getElementById('ptr-container');

document.addEventListener('touchstart', e => {
  if (window.scrollY === 0) {
    ptrStartY = e.touches[0].clientY;
    ptrReady = true;
    ptrTriggered = false;
  } else {
    ptrReady = false;
  }
});

document.addEventListener('touchmove', e => {
  if (!ptrReady) return;

  const diff = e.touches[0].clientY - ptrStartY;

  if (diff > 0) {
    e.preventDefault();

    const elastic = Math.min(diff / 2, 80);
    ptr.style.top = (-80 + elastic) + 'px';

    ptrTriggered = diff > 90;
  }
}, { passive: false });

document.addEventListener('touchend', () => {
  if (!ptrReady) return;

  if (ptrTriggered) {
    ptr.style.top = '0px';


    refresh();

    setTimeout(() => {
      ptr.style.top = '-80px';
    }, 1200);
  } else {
    ptr.style.top = '-80px';
  }

  ptrReady = false;
  ptrTriggered = false;
});

function refresh() {
    loadDevices();
    vibrate();
}