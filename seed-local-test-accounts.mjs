import admin from "./functions/node_modules/firebase-admin/lib/index.js";
const PROJECT_ID = "demo-sokohai";

admin.initializeApp({
  projectId: PROJECT_ID
});

const auth = admin.auth();
const db = admin.firestore();

const accounts = [
  {
    email: "rshabansaid@gmail.com",
    password: "000000",
    displayName: "SokoHai Admin",
    profile: {
      userRole: "admin",
      isAdmin: true
    },
    admin: true
  },
  {
    email: "seller1@sokohai.test",
    password: "SokoHai123!",
    displayName: "Test Seller",
    profile: {
      userRole: "seller",
      isSeller: true,
      sellerType: "permanent",
      shopName: "SokoHai Test Shop",
      businessName: "SokoHai Test Shop",
      businessSetupComplete: true,
      primaryProfile: "General Store"
    }
  },
  {
    email: "buyer1@sokohai.test",
    password: "SokoHai123!",
    displayName: "Test Buyer",
    profile: {
      userRole: "buyer",
      isBuyer: true
    }
  },
  {
    email: "agent1@sokohai.test",
    password: "SokoHai123!",
    displayName: "Test Agent",
    profile: {
      userRole: "agent",
      isAgent: true,
      agentCode: "LOCAL-AGENT-001"
    }
  },
  {
    email: "driver1@sokohai.test",
    password: "SokoHai123!",
    displayName: "Test Driver",
    profile: {
      userRole: "driver",
      isDriver: true,
      vehicleType: "boda",
      driverProfile: {
        vehicleType: "boda"
      }
    }
  }
];

async function main() {
  console.log("\nSokoHai LOCAL TEST ACCOUNTS");
  console.log("Project:", PROJECT_ID);
  console.log("--------------------------------");

  for (const a of accounts) {
    let user;

    try {
      user = await auth.getUserByEmail(a.email);
      console.log("EXISTS:", a.email);
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;

      user = await auth.createUser({
        email: a.email,
        password: a.password,
        displayName: a.displayName,
        emailVerified: true
      });

      console.log("CREATED:", a.email);
    }

    if (a.admin) {
      await auth.setCustomUserClaims(user.uid, {
        admin: true
      });
      console.log("  ADMIN CLAIM: true");
    }

    const existing = await db.doc(`users/${user.uid}`).get();
    const old = existing.exists ? existing.data() : {};

    await db.doc(`users/${user.uid}`).set({
      uid: user.uid,
      fullName: old.fullName || a.displayName,
      email: user.email,
      createdAt: old.createdAt || new Date().toISOString(),
      walletBalance: typeof old.walletBalance === "number"
        ? old.walletBalance
        : 0,
      followers: Array.isArray(old.followers)
        ? old.followers
        : [],
      following: Array.isArray(old.following)
        ? old.following
        : [],
      ...a.profile
    }, { merge: true });

    console.log("  PROFILE:", user.uid);
  }

  console.log("--------------------------------");
  console.log("LOCAL TEST ACCOUNTS READY.");
}

main().catch(err => {
  console.error("\nSEED ERROR:");
  console.error(err);
  process.exit(1);
});