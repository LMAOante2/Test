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
    if (infoInterval) clearInterval(infoInterval);
    infoInterval = null;
    for (let unsub of infoUnsubscribes) unsub();
    infoUnsubscribes = [];
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
    if (infoInterval) clearInterval(infoInterval);
    infoInterval = null;
    for (let unsub of infoUnsubscribes) unsub();
    infoUnsubscribes = [];
}

const offlineThreshold = 30;

let unsubscribes = [];
let infoUnsubscribes = [];
let statusInterval = null;
let infoInterval = null;
const deviceIsControllable = new Map();
const sensorDatas = new Map();
const controlStates = new Map();
const controlLastSeens = new Map();

function updateDeviceStatus(deviceId) {
    const statusP = document.getElementById(`status-${deviceId}`);
    if (!statusP) return;

    const isControllable = deviceIsControllable.get(deviceId);
    if (isControllable) {
        const state = controlStates.get(deviceId) || false;
        const ls = controlLastSeens.get(deviceId);
        const online = typeof ls === "number" && (Date.now() / 1000 - ls) < offlineThreshold;
        if (!online) {
            statusP.innerHTML = 'Offline';
            statusP.style.color = 'red';
        } else {
            const stateColor = state ? "green" : "red";
            statusP.innerHTML = `LED: <span style="color:${stateColor}; font-weight:bold; font-size:16px;">${state ? 'ON' : 'OFF'}</span>`;
            statusP.style.color = 'white';
        }
    } else {
        const sensorData = sensorDatas.get(deviceId);
        if (
    sensorData &&
    typeof sensorData.timestamp === "number" &&
    (Date.now() / 1000 - sensorData.timestamp) < offlineThreshold
)
 {
            const temp = convertTemperature(sensorData.temperature);
            const tempColor = sensorData.temperature >= 23 ? "rgb(219, 12, 12)" : "white";
            let humidityColor = "white";
            if (sensorData.humidity >= 60 || sensorData.humidity <= 20) humidityColor = "blue";
            statusP.style.color = 'white';
        } else {
            statusP.innerHTML = 'Offline';
            statusP.style.color = 'red';
        }
    }
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

    for (let unsub of infoUnsubscribes) unsub();
    infoUnsubscribes = [];
    if (infoInterval) clearInterval(infoInterval);
    infoInterval = null;

    if (controllable) {
        sensorP.style.display = 'none';
        controlDiv.style.display = 'block';
        const stateRef = ref(db, `devices/${deviceId}/control/state`);
        const lastSeenRef = ref(db, `devices/${deviceId}/control/lastSeen`);
        const toggleBtn = document.getElementById('toggle-button');

        let currentState = false;
        let currentLastSeen = undefined;
        let currentOnline = false;

        const updateButton = () => {
            if (!currentOnline) {
                toggleBtn.innerText = 'Offline';
                toggleBtn.disabled = true;
            } else {
                toggleBtn.innerText = currentState ? 'Turn Off' : 'Turn On';
                toggleBtn.disabled = false;
            }
        };

        const stateUnsub = onValue(stateRef, (stateSnap) => {
            currentState = stateSnap.val() || false;
            updateButton();
        });
        infoUnsubscribes.push(stateUnsub);

const lastSeenUnsub = onValue(lastSeenRef, (snap) => {
    const val = snap.val();

    currentLastSeen = val;  
    controlLastSeens.set(deviceId, val);

    currentOnline = typeof val === "number" && (Date.now()/1000 - val) < offlineThreshold;

    updateDeviceStatus(deviceId);
    updateButton();
});


        infoUnsubscribes.push(lastSeenUnsub);

        toggleBtn.onclick = () => {
            if (!currentOnline) return;
            get(stateRef).then((snap) => {
                const current = snap.val();
                set(stateRef, !current);
            });
        };

        infoInterval = setInterval(() => {
            if (currentLastSeen !== undefined) {
                currentOnline = currentLastSeen && (Date.now() / 1000 - currentLastSeen < offlineThreshold);
                updateButton();
            }
        }, 60000);
    } else {
        sensorP.style.display = 'block';
        controlDiv.style.display = 'none';
        const dataRef = ref(db, `devices/${deviceId}/sensor`);

        let currentSensorData = null;

        const updateInfo = () => {
            if (currentSensorData && (Date.now() / 1000 - currentSensorData.timestamp < offlineThreshold)) {
                const temp = convertTemperature(currentSensorData.temperature);
                const tempColor = currentSensorData.temperature >= 23 ? "rgb(219, 12, 12)" : "white";

                let humidityColor = "white";
                if (currentSensorData.humidity >= 60 || currentSensorData.humidity <= 20) humidityColor = "blue";

                sensorP.innerHTML = `
                    Temp: <span style="color:${tempColor}; font-weight:bold; font-size:16px;">
                    ${temp.value.toFixed(2)}${temp.unit}</span><br>

                    Hum: <span style="color:${humidityColor}; font-weight:bold; font-size:16px;">
                    ${currentSensorData.humidity.toFixed(2)}%</span><br>

                    Last: ${new Date(currentSensorData.timestamp * 1000).toLocaleString()}
                `;
            } else {
                sensorP.innerHTML = 'Offline';
                statusP.style.color = 'red';
            }
        };

        const dataUnsub = onValue(dataRef, (dataSnapshot) => {
            currentSensorData = dataSnapshot.val();
            updateInfo();
        });
        infoUnsubscribes.push(dataUnsub);

        infoInterval = setInterval(() => {
            updateInfo();
        }, 60000);
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

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`http://${ESP_IP}/data`, {
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const sensorP = document.getElementById('info-sensor');
            if (sensorP) sensorP.innerText = 'Offline';
            throw new Error('Failed to fetch data');
        }

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
    await set(ref(db, `devices/${deviceId}/control`), {
        state: false,
        lastSeen: Math.floor(Date.now() / 1000)
    });
}


        hideAddDeviceForm();
        loadDevices();

    } catch (error) {

        const sensorP = document.getElementById('info-sensor');
        if (sensorP) sensorP.innerText = "Offline";

        if (error.name === "AbortError") {
            document.getElementById('add-error').innerText = "Device not reachable (Offline)";
        } else {
            document.getElementById('add-error').innerText = error.message;
        }
    }
}


async function loadDevices() {
    for (let unsub of unsubscribes) unsub();
    unsubscribes = [];
    deviceIsControllable.clear();
    sensorDatas.clear();
    controlStates.clear();
    controlLastSeens.clear();
    if (statusInterval) clearInterval(statusInterval);
    statusInterval = null;

    const activeDeviceIds = [];

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

            activeDeviceIds.push(deviceId);
            deviceIsControllable.set(deviceId, deviceData.controllable);

            if (deviceData.controllable) {
                const stateRef = ref(db, `devices/${deviceId}/control/state`);
                const stateUnsub = onValue(stateRef, (stateSnapshot) => {
                    controlStates.set(deviceId, stateSnapshot.val());
                    updateDeviceStatus(deviceId);
                });
                unsubscribes.push(stateUnsub);

                const lastSeenRef = ref(db, `devices/${deviceId}/control/lastSeen`);
                const lastSeenUnsub = onValue(lastSeenRef, (snap) => {
                    controlLastSeens.set(deviceId, snap.val());
                    updateDeviceStatus(deviceId);
                });
                unsubscribes.push(lastSeenUnsub);
            } else {
                const dataRef = ref(db, `devices/${deviceId}/sensor`);
                const dataUnsub = onValue(dataRef, (dataSnapshot) => {
                    sensorDatas.set(deviceId, dataSnapshot.val());
                    updateDeviceStatus(deviceId);
                });
                unsubscribes.push(dataUnsub);
            }
        });

statusInterval = setInterval(() => {
    activeDeviceIds.forEach(id => updateDeviceStatus(id));
}, 5000);

    } else {
        deviceList.innerHTML = '<p>No devices added yet.</p>';
    }
}

function clearAllListeners() {
    for (let unsub of unsubscribes) unsub();
    unsubscribes = [];
    for (let unsub of infoUnsubscribes) unsub();
    infoUnsubscribes = [];
    if (statusInterval) clearInterval(statusInterval);
    statusInterval = null;
    if (infoInterval) clearInterval(infoInterval);
    infoInterval = null;
    deviceIsControllable.clear();
    sensorDatas.clear();
    controlStates.clear();
    controlLastSeens.clear();
}

auth.onAuthStateChanged((user) => {
    if (user) {
        showMainScreen();
    } else {
        clearAllListeners();
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
        clearAllListeners();
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

const profileInput = document.getElementById('profile-img-input');
const profilePreview = document.getElementById('profile-img-preview');
const profileError = document.getElementById('profile-error');

function loadProfileImage() {
    const user = auth.currentUser;
    if (!user) return;

    const userId = user.uid;
    const userRef = ref(db, `users/${userId}/profileImage`);
    get(userRef).then(snapshot => {
        if (snapshot.exists()) {
            profilePreview.src = snapshot.val();
        }
    }).catch(err => {
        console.log("Failed to load profile image:", err);
    });
}

profileInput.addEventListener('change', () => {
    const file = profileInput.files[0];
    if (!file) {
        profileError.innerText = "Please select an image.";
        return;
    }

    profileError.innerText = "";

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64String = e.target.result;
        const userId = auth.currentUser.uid;

        try {
            await set(ref(db, `users/${userId}/profileImage`), base64String);
            profilePreview.src = base64String;
            profileError.innerText = "Profile image uploaded successfully!";
        } catch (err) {
            profileError.innerText = "Failed to upload: " + err.message;
        }
    };

    reader.readAsDataURL(file);
});

auth.onAuthStateChanged(user => {
    if (user) {
        loadProfileImage();
    }
});