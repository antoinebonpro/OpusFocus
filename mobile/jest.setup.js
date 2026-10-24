// Stockage simulé en mémoire pour les tests (mock officiel du paquet).
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
