// src/js/student_d.js

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB0_9ram8RezushK3F7dO3UslQSKoi1AN0",
  authDomain: "studyflix-stream.firebaseapp.com",
  databaseURL: "https://studyflix-stream-default-rtdb.firebaseio.com",
  projectId: "studyflix-stream",
  storageBucket: "studyflix-stream.firebasestorage.app",
  messagingSenderId: "689543291600",
  appId: "1:689543291600:web:1224762c73ea2d04a334d5"
};

// SAFETY CHECK: Initialize only if an app doesn't already exist
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const firstName = userData.first_name;

        // 1. Update the main welcome header ("Welcome back, [Name]!")
        const studNameEl = document.getElementById('studName');
        if (studNameEl) {
          studNameEl.textContent = firstName;
        }

        // 2. Update the top bar name tag next to the avatar
        const topBarNameEl = document.getElementById('topBarName');
        if (topBarNameEl) {
          topBarNameEl.textContent = firstName;
        }

        // 3. Update the avatar circle to show the user's first initial
        const userInitEl = document.getElementById('userInit');
        if (userInitEl && firstName) {
          userInitEl.textContent = firstName.charAt(0).toUpperCase();
        }

        console.log("Dashboard profile synchronized successfully for:", firstName);
      } else {
        console.warn("User authenticated, but no matching Firestore document was found.");
      }
    } catch (error) {
      console.error("Error fetching user profile data:", error);
    }
  }
});