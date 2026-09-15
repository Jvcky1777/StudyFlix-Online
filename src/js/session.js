import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// =======================================================================
// 1. GLOBAL AUTHENTICATION & PROFILE ROUTER
// =======================================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    sessionStorage.setItem("currentUID", user.uid);
    sessionStorage.setItem("userEmail", user.email);
    // Only attempt to fetch profile data if we are on a dashboard page
    const topBarNameEl = document.getElementById('topBarName');
    const userInitEl = document.getElementById('userInit');
    
    if (topBarNameEl || userInitEl) {
      try {
        // Use 'let' so we can reassign it if we need to check the teachers collection
        let userDocSnap = await getDoc(doc(db, "students", user.uid));
        let isTeacher = false;

        // If not in students, check teachers
        if (!userDocSnap.exists()) {
          userDocSnap = await getDoc(doc(db, "teachers", user.uid));
          isTeacher = true; // We know they are a teacher if they are in this collection
        }

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const firstName = userData.firstName || userData.name || 'User';

          // Security: Prevent cross-portal access
          const currentPath = window.location.pathname;
          if (isTeacher && currentPath.includes('/student/')) {
            window.location.href = '../teacher/teacher-dashboard.html';
          } else if (!isTeacher && currentPath.includes('/teacher/')) {
            window.location.href = '../student/dashboard.html';
          }

          // Update the UI globally
          if (topBarNameEl) topBarNameEl.textContent = isTeacher ? `${firstName} (Instructor)` : firstName;
          if (userInitEl && firstName) userInitEl.textContent = firstName.charAt(0).toUpperCase();

          const studNameEl = document.getElementById('studName');
          if (studNameEl) studNameEl.textContent = firstName;
        }
      } catch (error) {
        console.error("Error fetching profile data:", error);
      }
    }
  } else {
    // Kick unauthorized users back to the root login page
    window.location.href = '../index.html';
  }
});

// =======================================================================
// 2. GLOBAL UI CONTROLS (Sidebar)
// =======================================================================
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const mainSidebar = document.getElementById('main-sidebar');

if (sidebarToggleBtn && mainSidebar) {
  sidebarToggleBtn.addEventListener('click', () => {
    mainSidebar.classList.toggle('collapsed');
  });
}

// =======================================================================
// 3. GLOBAL LOGOUT FUNCTION
// =======================================================================
window.logoutUser = () => {
  signOut(auth).then(() => {
    sessionStorage.removeItem("currentUID");
    window.location.href = '../index.html';
  }).catch((error) => {
    console.error("Error signing out:", error);
  });
};

// =======================================================================
// 4. GLOBAL ERROR BOUNDARY (The Safety Net)
// =======================================================================
window.addEventListener('error', (event) => {
  console.error("🚨 Global App Error Caught:", event.message, "at", event.filename, ":", event.lineno);
  // Optional: showToast("Something went wrong. Please refresh the page.");
});

window.addEventListener('unhandledrejection', (event) => {
  console.warn("⚠️ Unhandled Background Task Failed:", event.reason);
});