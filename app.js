import { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, ref, set, onValue, get } from './firebase.js';

const ESP_IP = '192.168.4.1';

function showMainScreen() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('settings-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'block';
    document.getElementById('info-screen').style.display = 'none';
    document.getElementById('addevicebtn').style.display = 'block';
    document.getElementById('footer').style.display = 'flex';
    document.getElementById('homebtn').classList.add("active");
    document.getElementById('settingsbtn').classList.remove("active");
    loadDevices();
}

function settnigs() {
    document.getElementById('settings-screen').style.display = 'block';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('info-screen').style.display = 'none';
    document.getElementById('addevicebtn').style.display = 'none';
    document.getElementById('homebtn').classList.remove("active");
    document.getElementById('footer').style.display = 'flex';
    document.getElementById('settingsbtn').classList.add("active");
}

function showDeviceInfo(deviceId, deviceName, mac) {
    document.getElementById('main-screen').style.display = 'none';
        document.getElementById('settings-screen').style.display = 'none';
    document.getElementById('info-screen').style.display = 'block';
    document.getElementById('addevicebtn').style.display = 'none';
    document.getElementById('footer').style.display = 'none';

    document.getElementById('info-device-name').innerText = `${deviceName} (${mac})`;

    const sensorP = document.getElementById('info-sensor');
    const dataRef = ref(db, `devices/${deviceId}/sensor`);
    onValue(dataRef, (dataSnapshot) => {
        const sensorData = dataSnapshot.val();
        if (sensorData) {
            const tempColor = sensorData.temperature >= 23 ? "rgb(219, 12, 12)" : "white";
            let humidityColor = "white";
            if (sensorData.humidity >= 60) {
                humidityColor = "blue";
            } else if (sensorData.humidity <= 20) {
                humidityColor = "blue";
            } else {
                humidityColor = "white";
            }
            sensorP.innerHTML = `
                Temp: <span style="color:${tempColor}; font-weight: bold; font-size: 16px;">${sensorData.temperature.toFixed(2)}°C</span><br>
                Hum: <span style="color:${humidityColor}; font-weight: bold; font-size: 16px;">${sensorData.humidity.toFixed(2)}%</span><br>
                Last: ${new Date(sensorData.timestamp * 1000).toLocaleString()}
            `;
        } else {
            sensorP.innerHTML = 'No sensor data available.';
        }
    });
    const controlDiv = document.getElementById('control-section');
    const stateRef = ref(db, `devices/${deviceId}/control/state`);
    get(stateRef).then((snapshot) => {
        if (snapshot.exists()) {
            controlDiv.style.display = 'block';
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
            controlDiv.style.display = 'none';
        }
    }).catch(() => {
        controlDiv.style.display = 'none';
    });
}

function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            showMainScreen();
        })
        .catch((error) => {
            document.getElementById('auth-error').innerText = error.message;
        });
}

function signup() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            showMainScreen();
        })
        .catch((error) => {
            document.getElementById('auth-error').innerText = error.message;
        });
}

function showAddDeviceForm() {
    document.getElementById('add-device-modal').style.display = 'block';
}

function hideAddDeviceForm() {
    document.getElementById('add-device-modal').style.display = 'none';
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
            added: new Date().toISOString()
        });

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
                <p id="sensor-${deviceId}"></p>
            `;
            deviceDiv.onclick = () => showDeviceInfo(deviceId, deviceData.name, deviceData.mac);
            deviceList.appendChild(deviceDiv);

            const dataRef = ref(db, `devices/${deviceId}/sensor`);
            onValue(dataRef, (dataSnapshot) => {
                const sensorData = dataSnapshot.val();
                if (sensorData) {
                    const tempColor = sensorData.temperature >= 23 ? "rgb(219, 12, 12)" : "black";
                    let humidityColor = "black";
                    if (sensorData.humidity >= 60) {
                        humidityColor = "blue";
                    } else if (sensorData.humidity <= 20) {
                        humidityColor = "blue";
                    } else {
                        humidityColor = "black";
                    }
                }
            });
        });
    } else {
        deviceList.innerHTML = '<p>No devices added yet.</p>';
    }
}

auth.onAuthStateChanged((user) => {
    if (user) {
        showMainScreen();
    }
});

function logout() {
    auth.signOut().then(() => {
        document.getElementById('login-screen').style.display = 'block';
        document.getElementById('main-screen').style.display = 'none';
        document.getElementById('info-screen').style.display = 'none';
        document.getElementById('settings-screen').style.display = 'none';
    });
}

window.login = login;
window.logout = logout;
window.signup = signup;
window.showAddDeviceForm = showAddDeviceForm;
window.hideAddDeviceForm = hideAddDeviceForm;
window.addDevice = addDevice;
window.showMainScreen = showMainScreen;
window.settings = settnigs;

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
