import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

/** Familles d'applications, les mêmes que sur PC. */
export type AppCategory = "social" | "games" | "media" | "browsers" | "other";
export type InstalledApp = { packageName: string; label: string; icon: string; category: AppCategory };
export type BlockerStatus = {
  active: boolean;
  endAt: number;
  blockedCount: number;
  /** Nom de la dernière application bloquée. */
  lastBlocked: string;
  lastBlockedAt: number;
  /** Les sites sont réellement filtrés en ce moment (VPN actif). */
  sites: boolean;
};
/** « block » : la liste est bloquée. « allow » : seule la liste est permise (plus les apps essentielles). */
export type BlockMode = "block" | "allow";
export type SessionOptions = {
  startAt: number;
  endAt: number;
  intention: string;
  blockApps: boolean;
  mode: BlockMode;
  packages: string[];
  blockSites: boolean;
  domains: string[];
  silence: boolean;
};

type NativeFocusBlocker = {
  getInstalledApps(): Promise<InstalledApp[]>;
  getEssentialPackages(): string[];
  isServiceEnabled(): boolean;
  openAccessibilitySettings(): void;
  openAppSettings(): void;
  isSilenceAllowed(): boolean;
  openSilenceSettings(): void;
  isVpnAllowed(): boolean;
  prepareVpn(): Promise<boolean>;
  startSession(options: SessionOptions): string[];
  updateLists(mode: BlockMode, packages: string[], domains: string[]): void;
  stopSession(): void;
  getStatus(): BlockerStatus;
  getOpenAtBoot(): boolean;
  setOpenAtBoot(enabled: boolean): void;
};

// Absent hors Android (ou dans Expo Go) : l'application reste utilisable, sans blocage.
const native = Platform.OS === "android" ? requireOptionalNativeModule<NativeFocusBlocker>("FocusBlocker") : null;

export const blockerAvailable = native != null;

export const getInstalledApps = async (): Promise<InstalledApp[]> => (native ? native.getInstalledApps() : []);
export const getEssentialPackages = (): string[] => native?.getEssentialPackages() ?? [];
export const isServiceEnabled = (): boolean => native?.isServiceEnabled() ?? false;
export const openAccessibilitySettings = () => native?.openAccessibilitySettings();
export const openAppSettings = () => native?.openAppSettings();
export const isSilenceAllowed = (): boolean => native?.isSilenceAllowed() ?? false;
export const openSilenceSettings = () => native?.openSilenceSettings();
export const isVpnAllowed = (): boolean => native?.isVpnAllowed() ?? false;
export const prepareVpn = async (): Promise<boolean> => (native ? native.prepareVpn() : false);
/** Renvoie les protections qui n'ont pas pu être activées (messages à afficher). */
export const startSession = (options: SessionOptions): string[] => native?.startSession(options) ?? [];
export const updateLists = (mode: BlockMode, packages: string[], domains: string[]) => native?.updateLists(mode, packages, domains);
export const stopSession = () => native?.stopSession();
export const getStatus = (): BlockerStatus =>
  native?.getStatus() ?? { active: false, endAt: 0, blockedCount: 0, lastBlocked: "", lastBlockedAt: 0, sites: false };
export const getOpenAtBoot = (): boolean => native?.getOpenAtBoot() ?? false;
export const setOpenAtBoot = (enabled: boolean) => native?.setOpenAtBoot(enabled);
