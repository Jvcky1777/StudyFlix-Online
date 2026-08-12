// 1. SECURE IMPORT: Pulling auth directly from your environment-protected config
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from "firebase/auth";

// =======================================================================
// 2. THE BOUNCER (Auth State Listener)
// =======================================================================
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Secure session active for UID:", user.uid);
    sessionStorage.setItem("currentUID", user.uid);
  } else {
    console.log("No active session. Redirecting to login...");
    // Kicks unauthorized users back to the root login page
    window.location.href = '../index.html';
  }
});

// =======================================================================
// 3. GLOBAL LOGOUT FUNCTION
// =======================================================================
window.logoutUser = () => {
  signOut(auth).then(() => {
    console.log("User signed out successfully.");
    window.location.href = '../index.html';
  }).catch((error) => {
    console.error("Error signing out:", error);
  });
};