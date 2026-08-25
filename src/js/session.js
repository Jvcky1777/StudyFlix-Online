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
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const firstName = userData.first_name;
          const isTeacher = userData.role === 'instructor';

          // Security: Prevent students from accessing teacher pages (and vice versa)
          const currentPath = window.location.pathname;
          if (isTeacher && currentPath.includes('/student/')) {
            window.location.href = '../teacher/teacher-dashboard.html';
          } else if (!isTeacher && currentPath.includes('/teacher/')) {
            window.location.href = '../student/dashboard.html';
          }

          // Update the UI globally
          if (topBarNameEl) topBarNameEl.textContent = isTeacher ? `${firstName} (Instructor)` : firstName;
          if (userInitEl && firstName) userInitEl.textContent = firstName.charAt(0).toUpperCase();

          // If the student dashboard has a specific welcome text, update it
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