// =======================================================================
// SECTION 1: IMPORTS (Using Web CDN Links)
// =======================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

// FIX: Added onAuthStateChanged and signOut right here so the script doesn't crash!
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

// 3. INITIALIZE FIREBASE
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 4. THE BOUNCER (Auth State Listener)
// This runs automatically the millisecond the page loads
onAuthStateChanged(auth, (user) => {
  if (user) {
    // The user is securely logged in!
    console.log("Secure session active for UID:", user.uid);
    
    // Optional: We can save the UID to sessionStorage if we need it for other scripts later
    sessionStorage.setItem("currentUID", user.uid);
  } else {
    // No user is logged in. Kick them out!
    console.log("No active session. Redirecting to login...");
    
    // Because this script runs from inside the /student/ or /teacher/ folders, 
    // we use '../' to go up one level back to the main index.html
    window.location.href = '../index.html';
  }
});

// 5. LOGOUT FUNCTION (Attach this to your Logout buttons)
window.logoutUser = () => {
  signOut(auth).then(() => {
    console.log("User signed out successfully.");
    // The onAuthStateChanged listener above will automatically catch this 
    // and redirect them to index.html!
  }).catch((error) => {
    console.error("Error signing out:", error);
  });
};