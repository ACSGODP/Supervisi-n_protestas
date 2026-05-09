import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, update, get } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyD-D50A7IhJOTb2xBwvCuoshvucziggOR4",
  authDomain: "monitoreo-defensoria.firebaseapp.com",
  databaseURL: "https://monitoreo-defensoria-default-rtdb.firebaseio.com",
  projectId: "monitoreo-defensoria",
  storageBucket: "monitoreo-defensoria.firebasestorage.app",
  messagingSenderId: "633665962819",
  appId: "1:633665962819:web:6ef68284612f45625425f6"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const storage = getStorage(app);

export { app, database, storage, ref, set, onValue, push, update, get, storageRef, uploadBytes, getDownloadURL };
