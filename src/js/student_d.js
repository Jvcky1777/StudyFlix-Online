// src/js/student_d.js

// 1. Import initialized instances from our central config
import { auth, db } from './firebase.js';

// 2. Import required SDK functions from npm packages
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// =======================================================================
// DASHBOARD UI SYNCHRONIZATION
// =======================================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      // Fetch the specific user's document from Firestore
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


// =======================================================================
// ACTION PANEL LOGIC: Joining Live Rooms
// =======================================================================
const joinLiveClassBtn = document.getElementById('joinLiveClassBtn');

if (joinLiveClassBtn) {
  joinLiveClassBtn.addEventListener('click', () => {
    // 1. Trigger the browser's native pop-up prompt
    const roomCode = prompt('Enter the 6-character Room Code provided by your instructor:');
    
    // 2. If they typed a code and hit OK, route them to the classroom
    if (roomCode && roomCode.trim() !== "") {
      window.location.href = `./classroom-live.html?room=${roomCode.trim()}`;
    }
  });
}