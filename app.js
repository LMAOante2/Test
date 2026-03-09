import {
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  ref,
  set,
  onValue,
  get
} from './firebase.js';

const PROVISIONING_TOKEN = "AB12CD34";           // ← must match ESP32 sketch
const PROVISIONING_HOST = "esp-device.local";    // mDNS name from ESP
const PROVISIONING_TIMEOUT_MS = 5000;

const celsius = document.getElementById("celsius");
const fahrenheit = document.getElementById("fahrenheit");

function convertTemperature(tempC) {
    if (fahrenheit && fahrenheit.checked) {
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
    } else if (navigator.vibrate) {
        navigator.vibrate(50);
    }
}

const savedUnit = localStorage.getItem("tempUnit");

if (savedUnit === "fahrenheit") {
    if (fahrenheit) fahrenheit.checked = true;
    if (celsius) celsius.checked = false;
} else {
    if (celsius) celsius.checked = true;
    if (fahrenheit) fahrenheit.checked = false;
}

if (celsius) {
  celsius.addEventListener("change", () => {
      if (celsius.checked) {
          if (fahrenheit) fahrenheit.checked = false;
          localStorage.setItem("tempUnit", "celsius");
      }
  });
}

if (fahrenheit) {
  fahrenheit.addEventListener("change", () => {
      if (fahrenheit.checked) {
          if (celsius) celsius.checked = false;
          localStorage.setItem("tempUnit", "fahrenheit");
      }
  });
}

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
    const homeBtn = document.getElementById('homebtn');
    const settingsBtn = document.getElementById('settingsbtn');
    if (homeBtn) homeBtn.classList.add("active");
    if (settingsBtn) settingsBtn.classList.remove("active");

    if (infoInterval) clearInterval(infoInterval);
    infoInterval = null;
    for (let unsub of infoUnsubscribes) if (typeof unsub === 'function') unsub();
    infoUnsubscribes = [];
    loadDevices();
}

function settings() {
    showElement('settings-screen');
    hideElement('login-screen');
    hideElement('main-screen');
    hideElement('info-screen');
    hideElement('addevicebtn');
    const homeBtn = document.getElementById('homebtn');
    const settingsBtn = document.getElementById('settingsbtn');
    if (homeBtn) homeBtn.classList.remove("active");
    showElement('footer', 'flex');
    if (settingsBtn) settingsBtn.classList.add("active");
    if (infoInterval) clearInterval(infoInterval);
    infoInterval = null;
    for (let unsub of infoUnsubscribes) if (typeof unsub === 'function') unsub();
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
        const state = !!controlStates.get(deviceId);
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
        if (sensorData && typeof sensorData.timestamp === "number" && (Date.now() / 1000 - sensorData.timestamp) < offlineThreshold) {
            const temp = convertTemperature(Number(sensorData.temperature ?? 0));
            const tempColor = (Number(sensorData.temperature) >= 23) ? "rgb(219, 12, 12)" : "white";
            let humidityColor = "white";
            if (Number(sensorData.humidity) >= 60 || Number(sensorData.humidity) <= 20) humidityColor = "blue";

            statusP.style.color = 'white';
        } else {
            statusP.innerHTML = 'Offline';
            statusP.style.color = 'red';
        }
    }
}

function showDeviceInfo(deviceId, deviceName, mac, controllable) {
    setCurrentDevice(deviceId);
    hideElement('main-screen');
    hideElement('settings-screen');
    showElement('info-screen');
    hideElement('addevicebtn');
    hideElement('footer');

    const infoDeviceNameEl = document.getElementById('info-device-name');
    if (infoDeviceNameEl) {
      infoDeviceNameEl.innerHTML = `${deviceName} (${mac}) <i class="fa-solid fa-pencil rename-icon" style="cursor: pointer; margin-left: 10px;" onclick="renameDevice('${deviceId}','${deviceName}','${mac}')"></i>`;
    }

    const imgRef = ref(db, `devices/${deviceId}/image`);

    get(imgRef).then(snapshot => {
        if (snapshot.exists()) {
            deviceImgPreview.src = snapshot.val();
        }
    });


    const sensorP = document.getElementById('info-sensor');
    const controlDiv = document.getElementById('control-section');

    for (let unsub of infoUnsubscribes) if (typeof unsub === 'function') unsub();
    infoUnsubscribes = [];
    if (infoInterval) clearInterval(infoInterval);
    infoInterval = null;

    if (controllable) {
        if (sensorP) sensorP.style.display = 'none';
        if (controlDiv) controlDiv.style.display = 'block';
        const stateRef = ref(db, `devices/${deviceId}/control/state`);
        const lastSeenRef = ref(db, `devices/${deviceId}/control/lastSeen`);
        const toggleBtn = document.getElementById('toggle-button');
        if (!toggleBtn) return;

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
            currentState = !!stateSnap.val();
            controlStates.set(deviceId, currentState);
            updateButton();
            updateDeviceStatus(deviceId);
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
                const current = !!snap.val();
                set(stateRef, !current);
            }).catch(err => {
                console.error("Failed to toggle:", err);
            });
        };

        infoInterval = setInterval(() => {
            if (currentLastSeen !== undefined) {
                currentOnline = currentLastSeen && (Date.now() / 1000 - currentLastSeen < offlineThreshold);
                updateButton();
            }
        }, 60000);
    } else {
        if (sensorP) sensorP.style.display = 'block';
        if (controlDiv) controlDiv.style.display = 'none';
        const dataRef = ref(db, `devices/${deviceId}/sensor`);

        let currentSensorData = null;

        const updateInfo = () => {
            if (!sensorP) return;
            if (currentSensorData && (Date.now() / 1000 - currentSensorData.timestamp < offlineThreshold)) {
                const temp = convertTemperature(Number(currentSensorData.temperature ?? 0));
                const tempColor = (Number(currentSensorData.temperature) >= 23) ? "rgb(219, 12, 12)" : "white";

                let humidityColor = "white";
                if (Number(currentSensorData.humidity) >= 60 || Number(currentSensorData.humidity) <= 20) humidityColor = "blue";

                sensorP.innerHTML = `
                    Temp: <span style="color:${tempColor}; font-weight:bold; font-size:16px;">
                    ${temp.value.toFixed(2)}${temp.unit}</span><br>

                    Hum: <span style="color:${humidityColor}; font-weight:bold; font-size:16px;">
                    ${Number(currentSensorData.humidity).toFixed(2)}%</span><br>

                    Last: ${new Date(currentSensorData.timestamp * 1000).toLocaleString()}
                `;
            } else {
                sensorP.innerHTML = 'Offline';
                sensorP.style.color = 'red';
            }
        };

        const dataUnsub = onValue(dataRef, (dataSnapshot) => {
            currentSensorData = dataSnapshot.val();
            sensorDatas.set(deviceId, currentSensorData);
            updateInfo();
            updateDeviceStatus(deviceId);
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
        const user = auth.currentUser;
        if (!user) {
            alert("No authenticated user.");
            return;
        }
        const userId = user.uid;
        set(ref(db, `users/${userId}/devices/${deviceId}/name`), newName)
            .then(() => {
                const infoDeviceNameEl = document.getElementById('info-device-name');
                if (infoDeviceNameEl) {
                    infoDeviceNameEl.innerHTML = `${newName} (${mac}) <i class="fa-solid fa-pencil rename-icon" style="cursor: pointer; margin-left: 10px;" onclick="renameDevice('${deviceId}','${newName}','${mac}')"></i>`;
                }
                loadDevices();
            })
            .catch(error => {
                alert("Error renaming device: " + error.message);
            });
    }
}

function login() {
    const emailEl = document.getElementById('email');
    const passEl = document.getElementById('password');
    const email = emailEl ? emailEl.value : '';
    const password = passEl ? passEl.value : '';

    signInWithEmailAndPassword(auth, email, password)
        .then(() => showMainScreen())
        .catch((error) => {
            const errEl = document.getElementById('auth-error');
            if (errEl) errEl.innerText = error.message;
        });
}

function signup() {
    const emailEl = document.getElementById('email');
    const passEl = document.getElementById('password');
    const email = emailEl ? emailEl.value : '';
    const password = passEl ? passEl.value : '';

    createUserWithEmailAndPassword(auth, email, password)
        .then(() => showMainScreen())
        .catch((error) => {
            const errEl = document.getElementById('auth-error');
            if (errEl) errEl.innerText = error.message;
        });
}

function showAddDeviceForm() {
    showElement('add-device-modal');
}

function hideAddDeviceForm() {
    hideElement('add-device-modal');
}

async function fetchWithTimeout(url, options = {}, timeout = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function tryHosts(path, options = {}, timeout = 4000) {

  const hosts = [
    `http://${PROVISIONING_HOST}`, // esp-device.local
    `http://192.168.4.1`           // fallback
  ];

  for (const host of hosts) {
    try {

      const res = await fetchWithTimeout(
        `${host}${path}`,
        options,
        timeout
      );

      if (!res.ok) throw new Error(res.statusText);

      return res;

    } catch (err) {

      console.warn("Failed:", host, err);

    }
  }

  throw new Error("ESP32 not reachable");
}

async function addDevice() {

  const homeSSID = document.getElementById("home-ssid").value;
  const homePassword = document.getElementById("home-password").value;
  const deviceName = document.getElementById("device-name").value || "My Device";

  const user = auth.currentUser;

  if (!user) {
    alert("Not logged in");
    return;
  }

  const uid = user.uid;

  try {

    // get device info
    const res = await tryHosts("/data", {
      method: "GET",
      headers: { "Accept": "application/json" }
    }, 3000);

    const data = await res.json();

    const deviceId = data.mac.replace(/:/g, '');

    // send wifi config to ESP
    await tryHosts("/configure", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ssid: homeSSID,
        password: homePassword,
        deviceId: deviceId
      })
    }, 5000);

    // save device in firebase
    await set(ref(db, `users/${uid}/devices/${deviceId}`), {
      name: deviceName,
      mac: data.mac,
      controllable: true
    });

    alert("Device added! Reconnect to your normal WiFi.");

  } catch (err) {

    console.error(err);

    alert(
      "ESP32 not reachable.\n\n" +
      "Make sure you are connected to the ESP WiFi.\n" +
      "Disable mobile data if using a phone."
    );

  }
}




async function loadDevices() {
    for (let unsub of unsubscribes) if (typeof unsub === 'function') unsub();
    unsubscribes = [];
    deviceIsControllable.clear();
    sensorDatas.clear();
    controlStates.clear();
    controlLastSeens.clear();
    if (statusInterval) clearInterval(statusInterval);
    statusInterval = null;

    const activeDeviceIds = [];

    const user = auth.currentUser;
    if (!user) {
        const deviceList = document.getElementById('device-list');
        if (deviceList) deviceList.innerHTML = '<p>Please login to see devices.</p>';
        return;
    }
    const userId = user.uid;
    const devicesRef = ref(db, `users/${userId}/devices`);
    const snapshot = await get(devicesRef);

    const deviceList = document.getElementById('device-list');
    if (deviceList) deviceList.innerHTML = '';

    if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
            const deviceId = childSnapshot.key;
            const deviceData = childSnapshot.val();

            const deviceDiv = document.createElement('div');
            deviceDiv.className = 'device-item';

            deviceDiv.innerHTML = `
                <img id="img-${deviceId}" src="default-device.png" alt="Device Image" class="device-img">
                <h3>${deviceData.name}</h3>
                <p id="status-${deviceId}"></p>
            `;

            deviceDiv.onclick = () => showDeviceInfo(deviceId, deviceData.name, deviceData.mac, deviceData.controllable);
            if (deviceList) deviceList.appendChild(deviceDiv);

            activeDeviceIds.push(deviceId);
            deviceIsControllable.set(deviceId, !!deviceData.controllable);

            // Load device image
            const imgRef = ref(db, `devices/${deviceId}/image`);
            get(imgRef).then(imgSnapshot => {
                const imgEl = document.getElementById(`img-${deviceId}`);
                if (imgEl && imgSnapshot.exists()) {
                    imgEl.src = imgSnapshot.val();
                }
            }).catch(err => {
                console.error("Failed to load device image:", err);
            });

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
        if (deviceList) deviceList.innerHTML = '<p>No devices added yet.</p>';
    }
}

function clearAllListeners() {
    for (let unsub of unsubscribes) if (typeof unsub === 'function') unsub();
    unsubscribes = [];
    for (let unsub of infoUnsubscribes) if (typeof unsub === 'function') unsub();
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
        loadProfileImage();
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

if (eye && passwordInput) {
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
}

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
  if (!ptrReady || !ptr) return;

  const diff = e.touches[0].clientY - ptrStartY;

  if (diff > 0) {
    e.preventDefault();

    const elastic = Math.min(diff / 2, 80);
    ptr.style.top = (-80 + elastic) + 'px';

    ptrTriggered = diff > 90;
  }
}, { passive: false });

document.addEventListener('touchend', () => {
  if (!ptrReady || !ptr) return;

  if (ptrTriggered) {
    ptr.style.top = '0px';
    refresh();
    loadProfileImage();

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
            if (profilePreview) profilePreview.src = snapshot.val();
        }
    }).catch(err => {
        console.log("Failed to load profile image:", err);
    });
}

const cropModal = document.getElementById('crop-modal');
const cropImg = document.getElementById('crop-img');
const cropBtn = document.getElementById('crop-btn');
const cancelCrop = document.getElementById('cancel-crop');

let currentURL = null;
let isDragging = false;
let startX, startY, startLeft, startTop;

function initDrag(e) {
    if (!cropImg) return;
    isDragging = true;
    startX = e.clientX || (e.touches && e.touches[0].clientX);
    startY = e.clientY || (e.touches && e.touches[0].clientY);
    startLeft = parseFloat(cropImg.style.left) || 0;
    startTop = parseFloat(cropImg.style.top) || 0;
}

function drag(e) {
    if (!isDragging || !cropImg) return;
    e.preventDefault();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    let dx = clientX - startX;
    let dy = clientY - startY;
    let newLeft = startLeft + dx;
    let newTop = startTop + dy;
    const containerSize = 200;
    const imgWidth = cropImg.width;
    const imgHeight = cropImg.height;
    newLeft = Math.min(0, Math.max(newLeft, containerSize - imgWidth));
    newTop = Math.min(0, Math.max(newTop, containerSize - imgHeight));
    cropImg.style.left = newLeft + 'px';
    cropImg.style.top = newTop + 'px';
}

function endDrag() {
    isDragging = false;
}

if (cropImg) {
  cropImg.addEventListener('mousedown', initDrag);
  cropImg.addEventListener('touchstart', initDrag, {passive: false});
}
document.addEventListener('mousemove', drag);
document.addEventListener('touchmove', drag, {passive: false});
document.addEventListener('mouseup', endDrag);
document.addEventListener('touchend', endDrag);

const deviceImgInput = document.getElementById("device-img-input");
const deviceImgPreview = document.getElementById("device-img-preview");
const deviceImgError = document.getElementById("device-image-error");

let currentDeviceId = null;
let cropType = null;

function setCurrentDevice(deviceId) {
    currentDeviceId = deviceId;
}

if (profileInput && cropImg) {
  profileInput.addEventListener('change', () => {
      const file = profileInput.files[0];
      if (!file) return;
      if (currentURL) URL.revokeObjectURL(currentURL);
      currentURL = URL.createObjectURL(file);
      cropType = 'profile';
      cropImg.src = currentURL;
      cropImg.onload = () => {
          const containerSize = 200;
          const imgW = cropImg.naturalWidth;
          const imgH = cropImg.naturalHeight;
          const scale = Math.max(containerSize / imgW, containerSize / imgH);
          const scaledW = imgW * scale;
          const scaledH = imgH * scale;
          cropImg.style.width = scaledW + 'px';
          cropImg.style.height = scaledH + 'px';
          cropImg.style.left = - (scaledW - containerSize) / 2 + 'px';
          cropImg.style.top = - (scaledH - containerSize) / 2 + 'px';
      };
      showElement('crop-modal');
  });
}

if (deviceImgInput && cropImg) {
  deviceImgInput.addEventListener('change', () => {
      const file = deviceImgInput.files[0];
      if (!file) return;
      if (!currentDeviceId) {
        if (deviceImgError) deviceImgError.innerText = "No device selected";
        return;
      }
      if (currentURL) URL.revokeObjectURL(currentURL);
      currentURL = URL.createObjectURL(file);
      cropType = 'device';
      cropImg.src = currentURL;
      cropImg.onload = () => {
          const containerSize = 200;
          const imgW = cropImg.naturalWidth;
          const imgH = cropImg.naturalHeight;
          const scale = Math.max(containerSize / imgW, containerSize / imgH);
          const scaledW = imgW * scale;
          const scaledH = imgH * scale;
          cropImg.style.width = scaledW + 'px';
          cropImg.style.height = scaledH + 'px';
          cropImg.style.left = - (scaledW - containerSize) / 2 + 'px';
          cropImg.style.top = - (scaledH - containerSize) / 2 + 'px';
      };
      showElement('crop-modal');
  });
}

if (cropBtn && cropImg) {
  cropBtn.addEventListener('click', async () => {
      const containerSize = 200;
      const left = parseFloat(cropImg.style.left) || 0;
      const top = parseFloat(cropImg.style.top) || 0;
      const imgWidth = cropImg.width;
      const imgHeight = cropImg.height;
      const scale = imgWidth / cropImg.naturalWidth;
      const sx = -left / scale;
      const sy = -top / scale;
      const sw = containerSize / scale;
      const sh = containerSize / scale;
      const canvas = document.createElement('canvas');
      canvas.width = containerSize;
      canvas.height = containerSize;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(cropImg, sx, sy, sw, sh, 0, 0, containerSize, containerSize);
      const base64 = canvas.toDataURL('image/jpeg', 0.6);


      const user = auth.currentUser;
      if (!user) {
          if (cropType === 'profile' && profileError) profileError.innerText = "Not authenticated";
          if (cropType === 'device' && deviceImgError) deviceImgError.innerText = "Not authenticated";
          return;
      }
      const userId = user.uid;
      try {
          if (cropType === 'profile') {
            await set(ref(db, `users/${userId}/profileImage`), base64);
            if (profilePreview) profilePreview.src = base64;
            if (profileError) profileError.innerText = "Profile image uploaded successfully!";
          } else if (cropType === 'device') {
            await set(ref(db, `devices/${currentDeviceId}/image`), base64);
            if (deviceImgPreview) deviceImgPreview.src = base64;
            if (deviceImgError) deviceImgError.innerText = "Device image uploaded successfully!";
          }
      } catch (err) {
          if (cropType === 'profile' && profileError) profileError.innerText = "Failed to upload: " + err.message;
          if (cropType === 'device' && deviceImgError) deviceImgError.innerText = "Failed to upload: " + err.message;
      }
      hideElement('crop-modal');
      if (currentURL) URL.revokeObjectURL(currentURL);
      currentURL = null;
      if (cropType === 'profile' && profileInput) profileInput.value = '';
      if (cropType === 'device' && deviceImgInput) deviceImgInput.value = '';
      cropType = null;
  });
}

if (cancelCrop) {
    cancelCrop.addEventListener('click', () => {
        hideElement('crop-modal');
        if (currentURL) {
            URL.revokeObjectURL(currentURL);
            currentURL = null;
        }
        if (cropType === 'profile' && profileInput) profileInput.value = '';
    })
    }