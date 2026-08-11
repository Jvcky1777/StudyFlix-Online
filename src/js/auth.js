// 1. Import initialized instances from our central config
import { auth, db } from './firebase.js';

// 2. Import required SDK functions from npm packages
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';

import { 
  doc, 
  setDoc, 
  getDoc 
} from 'firebase/firestore';

// =======================================================================
// SECTION 3: REGISTRATION LOGIC (Creating a New Account)
// =======================================================================
const registerForm = document.getElementById('registerForm');

if (registerForm) {
  registerForm.addEventListener('submit', async function(event) {
    event.preventDefault(); // Stop the page from refreshing
    
    // 1. Read what the user typed in the HTML boxes
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const contactNumber = document.getElementById('contactNumber').value;
    const grade = document.getElementById('grade').value;
    const role = document.getElementById('role').value;
    
    try {
      // 2. Create the secure password login via Firebase Authentication
      // EXPLANATION: This talks to the `auth` service. If successful, it returns 
      // a user object containing their unique UID.
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user; // This contains their secure unique ID (uid)

      // 3. Save their public profile details to the "users" collection
      // EXPLANATION: This takes the UID generated above and creates a document 
      // in the Firestore database (`db`) using that exact ID, linking their auth to their data.
      await setDoc(doc(db, "users", user.uid), {
        first_name: firstName,
        last_name: lastName,
        email: email,
        contact_number: contactNumber,
        grade: grade,
        role: role
      });

      // 4. Send them to the correct folder based on what they selected
      // EXPLANATION: JavaScript checks the dropdown value and routes the user.
      if (role === 'instructor') {
        window.location.href = './teacher/teacher-dashboard.html'; 
      } else {
        window.location.href = './student/dashboard.html';
      }

    } catch (error) {
      // Catch duplicate emails, weak passwords, etc.
      console.error("Registration Error:", error);
      alert("Registration failed: " + error.message);
    }
  });
}

// =======================================================================
// SECTION 4: LOGIN LOGIC (Returning Users)
// =======================================================================
const loginForm = document.getElementById('loginForm');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Stop the page from refreshing

    // Read the email and password from the login HTML boxes
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
      // 1. Ask Firebase if the password matches the email
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Go to the "users" collection and fetch their profile document
      // EXPLANATION: Now that we know they are who they say they are, we use 
      // their UID to grab their full profile data out of the Firestore database.
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        // 3. Read the 'role' field from their database profile
        const userData = userDocSnap.data();
        const userRole = userData.role;

        // 4. Route them based on their official database role
        // EXPLANATION: This prevents a student from logging in and manually 
        // trying to access the instructor dashboard. It checks the database directly.
        if (userRole === 'instructor') {
          window.location.href = './teacher/teacher-dashboard.html';
        } else {
          window.location.href = './student/dashboard.html';
        }
      } else {
        alert("Account verified, but profile data is missing in the database.");
      }

    } catch (error) {
      // Catch wrong passwords or invalid emails
      console.error("Login Error:", error);
      alert("Invalid email or password.");
    }
  });
}