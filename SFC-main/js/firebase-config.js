import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

// !!! REPLACE WITH YOUR PROJECT CONFIG FROM FIREBASE CONSOLE !!!
const firebaseConfig = {
  apiKey: "AIzaSyDlAAJEV2YblDNjPkRDcZnHLywDohbHq3A",
  authDomain: "eady-to-cook.firebaseapp.com",
  databaseURL: "https://eady-to-cook-default-rtdb.firebaseio.com",
  projectId: "eady-to-cook",
  storageBucket: "eady-to-cook.firebasestorage.app",
  messagingSenderId: "45097400248",
  appId: "1:45097400248:web:bef495cd3a77575300c14d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage, firebaseConfig };
