# BlueOrangeAuthRN (React Native + Expo + Firebase Auth + Firestore)

✅ Projet **prêt** : Login / SignUp / Welcome + Logout  
🎨 UI moderne **Bleu + Orange** (2 couleurs principales)

---

## 1) Installation
```bash
npm install
```

## 2) Config Firebase
1. Firebase Console -> **Create project**
2. Build -> **Authentication** -> Get started -> **Email/Password** -> Enable
3. Build -> **Firestore Database** -> Create database
4. Project settings -> **Your apps** -> **Web app** -> copie la config

Ensuite ouvre:
`src/firebase/firebase.js`  
et remplace:
- apiKey
- authDomain
- projectId
- storageBucket
- messagingSenderId
- appId

## 3) Lancer le projet
```bash
npm start
```

---

## Firestore (ce qui est enregistré)
Collection: `users`
Document: `users/{uid}`
```json
{
  "firstName": "...",
  "lastName": "...",
  "email": "...",
  "createdAt": "serverTimestamp"
}
```

---

## Notes
- Si tu veux ajouter "Forget password", je peux l’ajouter (sendPasswordResetEmail).
- Si tu veux la même UI en **TypeScript**, je te fournis la version TS.
