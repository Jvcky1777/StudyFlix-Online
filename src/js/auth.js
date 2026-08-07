// src/js/auth.js

// 1. Grab the form elements from index.html
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

// 2. Listen for the user clicking "Log In"
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevents the page from refreshing

    const email = emailInput.value;
    const password = passwordInput.value;

    console.log(`Attempting to log in with: ${email}`);

    try {
      // ==========================================
      // TODO: Connect to backend auth service here
      // const { user, error } = await signIn(email, password);
      // ==========================================

      // For now, let's simulate fetching the user's profile to check their role
      const mockUserRole = checkUserRole(email); 

      // 3. The Routing Engine (The Bouncer)
      if (mockUserRole === 'instructor') {
        console.log("Instructor detected. Routing to Command Center...");
        window.location.href = './teacher/instructor-dashboard.html';
      } else if (mockUserRole === 'student') {
        console.log("Student detected. Routing to Dashboard...");
        window.location.href = './student/dashboard.html';
      } else {
        alert("Account role not found. Please contact support.");
      }

    } catch (error) {
      console.error("Login failed:", error);
      alert("Invalid login credentials.");
    }
  });
}

// A temporary helper function to test our routing logic
function checkUserRole(email) {
  // If the email contains 'tutor' or 'teacher', treat them as an instructor
  if (email.includes('tutor') || email.includes('teacher')) {
    return 'instructor';
  }
  // Otherwise, default to student
  return 'student';
}