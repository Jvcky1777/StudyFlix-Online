// =======================================================================
// SECTION 1: IMPORTS (Using Web CDN Links)
// =======================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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

// Boot up the connections to your specific project
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);    // Controls the login/passwords
const db = getFirestore(app); // Controls the database collections

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
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user; // This contains their secure unique ID (uid)

      // 3. Save their public profile details to the "users" collection
      await setDoc(doc(db, "users", user.uid), {
        first_name: firstName,
        last_name: lastName,
        email: email,
        contact_number: contactNumber,
        grade: grade,
        role: role
      });

      // 4. Send them to the correct folder based on what they selected
      if (role === 'instructor') {
        window.location.href = './teacher/instructor-dashboard.html'; 
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
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        // 3. Read the 'role' field from their database profile
        const userData = userDocSnap.data();
        const userRole = userData.role;

        // 4. Route them based on their official database role
        if (userRole === 'instructor') {
          window.location.href = './teacher/instructor-dashboard.html';
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