// 1. Import initialized instances from our central config
import { auth, db } from './firebase.js';

// 2. Import required SDK functions from npm packages
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// =======================================================================
// INSTRUCTOR DASHBOARD UI SYNCHRONIZATION
// =======================================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      // Fetch the specific user's document from Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        
        // Extra security: Kick them out if a student tries to access this page
        if (userData.role !== 'instructor') {
          console.warn("Unauthorized access. Redirecting to student portal.");
          window.location.href = '../student/dashboard.html';
          return;
        }

        const firstName = userData.first_name;

        // 1. Update the top bar name tag
        const topBarNameEl = document.getElementById('topBarName');
        if (topBarNameEl) {
          topBarNameEl.textContent = `${firstName} (Instructor)`;
        }

        // 2. Update the avatar circle to show the user's first initial
        const userInitEl = document.getElementById('userInit');
        if (userInitEl && firstName) {
          userInitEl.textContent = firstName.charAt(0).toUpperCase();
        }

        console.log("Instructor profile synchronized successfully for:", firstName);
      }
    } catch (error) {
      console.error("Error fetching instructor profile data:", error);
    }
  }
});

// =======================================================================
// ACTION PANEL LOGIC: Generating Live Rooms
// =======================================================================
const goLiveBtn = document.getElementById('goLiveBtn');

if (goLiveBtn) {
  goLiveBtn.addEventListener('click', () => {
    // 1. Generate a random 6-character room code (e.g., "x7b9qp")
    const roomId = Math.random().toString(36).substring(2, 8);
    
    console.log("Generating secure live room:", roomId);
    
    // 2. Route the teacher to the classroom and pass the room ID in the URL
    // Route the teacher to their dedicated host room
    window.location.href = `./teacher-live.html?room=${roomId}`;
  });
}