// =======================================================================
// SECTION 1: IMPORTS (Using NPM Packages)
// =======================================================================
// Instead of pulling from external websites, Vite bundles these directly 
// from the node_modules folder installed on your machine.
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// =======================================================================
// SECTION 2: CONFIGURATION & SETUP
// =======================================================================
// EXPLANATION: Vite looks for variables starting with VITE_ in your .env file.
// During the build process, it replaces `import.meta.env.VITE_...` with your 
// actual secure keys so they never have to be hardcoded in this file.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Boot up the connections to your specific project using the hidden keys[cite: 7]
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);    // Controls the login/passwords[cite: 7]
const db = getFirestore(app); // Controls the database collections[cite: 7]

// =======================================================================
// SECTION 3: REGISTRATION LOGIC (Creating a New Account)
// =======================================================================
const registerForm = document.getElementById('registerForm');

if (registerForm) {
  registerForm.addEventListener('submit', async function(event) {
    event.preventDefault(); // Stop the page from refreshing[cite: 7]
    
    // 1. Read what the user typed in the HTML boxes[cite: 7]
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const contactNumber = document.getElementById('contactNumber').value;
    const grade = document.getElementById('grade').value;
    const role = document.getElementById('role').value;
    
    try {
      // 2. Create the secure password login via Firebase Authentication[cite: 7]
      // EXPLANATION: This talks to the `auth` service. If successful, it returns 
      // a user object containing their unique UID.
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user; // This contains their secure unique ID (uid)[cite: 7]

      // 3. Save their public profile details to the "users" collection[cite: 7]
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

      // 4. Send them to the correct folder based on what they selected[cite: 7]
      // EXPLANATION: JavaScript checks the dropdown value and routes the user.
      if (role === 'instructor') {
        window.location.href = './teacher/instructor-dashboard.html'; 
      } else {
        window.location.href = './student/dashboard.html';
      }

    } catch (error) {
      // Catch duplicate emails, weak passwords, etc.[cite: 7]
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
    e.preventDefault(); // Stop the page from refreshing[cite: 7]

    // Read the email and password from the login HTML boxes[cite: 7]
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
      // 1. Ask Firebase if the password matches the email[cite: 7]
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Go to the "users" collection and fetch their profile document[cite: 7]
      // EXPLANATION: Now that we know they are who they say they are, we use 
      // their UID to grab their full profile data out of the Firestore database.
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        // 3. Read the 'role' field from their database profile[cite: 7]
        const userData = userDocSnap.data();
        const userRole = userData.role;

        // 4. Route them based on their official database role[cite: 7]
        // EXPLANATION: This prevents a student from logging in and manually 
        // trying to access the instructor dashboard. It checks the database directly.
        if (userRole === 'instructor') {
          window.location.href = './teacher/instructor-dashboard.html';
        } else {
          window.location.href = './student/dashboard.html';
        }
      } else {
        alert("Account verified, but profile data is missing in the database.");
      }

    } catch (error) {
      // Catch wrong passwords or invalid emails[cite: 7]
      console.error("Login Error:", error);
      alert("Invalid email or password.");
    }
  });
}