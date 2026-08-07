// =======================================================================
// SECTION 1: IMPORTS (Using Web CDN Links)
// =======================================================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// =======================================================================
// SECTION 2: CONFIGURATION & SETUP
// =======================================================================
const firebaseConfig = {
  apiKey: "AIzaSyB0_9ram8RezushK3F7dO3UslQSKoi1AN0",
  authDomain: "studyflix-stream.firebaseapp.com",
  databaseURL: "https://studyflix-stream-default-rtdb.firebaseio.com",
  projectId: "studyflix-stream",
  storageBucket: "studyflix-stream.firebasestorage.app",
  messagingSenderId: "689543291600",
  appId: "1:689543291600:web:1224762c73ea2d04a334d5",
  measurementId: "G-3FF93DBYTM"
};

// 3. INITIALIZE FIREBASE SAFELY
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

// 4. THE BOUNCER (Auth State Listener)
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Secure session active for UID:", user.uid);
    sessionStorage.setItem("currentUID", user.uid);
  } else {
    console.log("No active session. Redirecting to login...");
    window.location.href = '../index.html';
  }
});

// 5. LOGOUT FUNCTION
window.logoutUser = () => {
  signOut(auth).then(() => {
    console.log("User signed out successfully.");
  }).catch((error) => {
    console.error("Error signing out:", error);
  });
};