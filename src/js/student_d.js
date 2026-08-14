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
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const firstName = userData.first_name;

        const studNameEl = document.getElementById('studName');
        if (studNameEl) studNameEl.textContent = firstName;

        const topBarNameEl = document.getElementById('topBarName');
        if (topBarNameEl) topBarNameEl.textContent = firstName;

        const userInitEl = document.getElementById('userInit');
        if (userInitEl && firstName) userInitEl.textContent = firstName.charAt(0).toUpperCase();

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
// ACTION PANEL LOGIC: Custom Modal & Room Code Verification
// =======================================================================
const joinLiveClassBtn = document.getElementById('joinLiveClassBtn');
const roomModal = document.getElementById('room-modal');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalJoinBtn = document.getElementById('modal-join-btn');
const roomCodeInput = document.getElementById('room-code-input');

// 1. Open Modal when clicking "Join Class"
if (joinLiveClassBtn && roomModal) {
  joinLiveClassBtn.addEventListener('click', () => {
    roomModal.style.display = 'flex';
    if (roomCodeInput) {
      roomCodeInput.value = '';
      roomCodeInput.focus();
    }
  });
}

// 2. Close Modal on Cancel
if (modalCancelBtn && roomModal) {
  modalCancelBtn.addEventListener('click', () => {
    roomModal.style.display = 'none';
  });
}

// 3. Verify Room Code in Firestore and Route Accordingly
if (modalJoinBtn && roomCodeInput) {
  modalJoinBtn.addEventListener('click', async () => {
    const roomCode = roomCodeInput.value.trim();

    if (!roomCode || roomCode.length < 5) {
      alert("Please enter a valid room code.");
      return;
    }

    modalJoinBtn.textContent = "Verifying...";
    modalJoinBtn.disabled = true;

    try {
      const roomRef = doc(db, 'classrooms', roomCode);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        // Room does not exist -> Go to Class Not Found page
        window.location.href = './class-not-found.html';
        return;
      }

      const roomData = roomSnap.data();
      if (roomData.status === 'ended') {
        // Room has ended -> Go to Session Ended page
        window.location.href = './session-ended.html';
        return;
      }

      // Valid active room -> Enter the live room
      window.location.href = `./classroom-live.html?room=${roomCode}`;

    } catch (error) {
      console.error("Error verifying room code:", error);
      alert("An error occurred while connecting to the classroom. Please try again.");
      modalJoinBtn.textContent = "Join Class";
      modalJoinBtn.disabled = false;
    }
  });
}