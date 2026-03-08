import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getDatabase, ref, set, onValue, get } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';




const firebaseConfig = {
  apiKey: "AIzaSyBtKzChDkWMPIlReHYWiwO6snDVM2WhQ3c",
  authDomain: "esp32test-1f152.firebaseapp.com",
  databaseURL: "https://esp32test-1f152-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "esp32test-1f152",
  storageBucket: "esp32test-1f152.firebasestorage.app",
  messagingSenderId: "735589369664",
  appId: "1:735589369664:web:4bd008f7664350c587dca5",
  measurementId: "G-Y5X1E1G7G5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, ref, set, onValue, get };