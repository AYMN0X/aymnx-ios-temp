import { Platform } from 'react-native';
import Constants, { AppOwnership } from 'expo-constants';
import type {
  ConfigureParams,
  SignInResponse,
  User as GoogleUser,
} from '@react-native-google-signin/google-signin';

export const GOOGLE_AUTH_UNAVAILABLE_MESSAGE =
  'Google Sign-In requires a standalone build; using guest/cached session in Expo Go.';

export interface GoogleAuthStatusCodes {
  SIGN_IN_CANCELLED: string;
  IN_PROGRESS: string;
  PLAY_SERVICES_NOT_AVAILABLE: string;
  SIGN_IN_REQUIRED: string;
  NULL_PRESENTER: string;
}

export interface GoogleAuthBridge {
  configure(options?: ConfigureParams): void;
  hasPlayServices(options?: { showPlayServicesUpdateDialog: boolean }): Promise<boolean>;
  signIn(): Promise<SignInResponse>;
  signOut(): Promise<null>;
  hasPreviousSignIn(): boolean;
  getCurrentUser(): GoogleUser | null;
  isSignedIn(): boolean;
}

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

declare function require(moduleName: string): any;

const GOOGLE_AUTH_CONFIG: ConfigureParams = {
  webClientId: '440854060458-kf8536m7gd7dru9111sg82notra3vrqs.apps.googleusercontent.com',
  iosClientId: '440854060458-3mhav004vt2eb359j9671c6pb25aurcv.apps.googleusercontent.com',
};

const LOCAL_STATUS_CODES: GoogleAuthStatusCodes = {
  SIGN_IN_CANCELLED: '-5',
  IN_PROGRESS: '-4',
  PLAY_SERVICES_NOT_AVAILABLE: '-3',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  NULL_PRESENTER: 'NULL_PRESENTER',
};

const MOCK_GOOGLE_AUTH: GoogleAuthBridge = {
  configure: () => {
    console.warn(
      '[google-auth] Google Sign-In is unavailable in Expo Go; configure() was ignored.'
    );
  },
  hasPlayServices: async () => true,
  signIn: async () => {
    console.warn(GOOGLE_AUTH_UNAVAILABLE_MESSAGE);
    throw new Error(GOOGLE_AUTH_UNAVAILABLE_MESSAGE);
  },
  signOut: async () => null,
  hasPreviousSignIn: () => false,
  getCurrentUser: () => null,
  isSignedIn: () => false,
};

function buildRealBridge(native: GoogleSigninModule['GoogleSignin']): GoogleAuthBridge {
  return {
    configure: (options) => native.configure(options),
    hasPlayServices: (options) =>
      native.hasPlayServices({ showPlayServicesUpdateDialog: options?.showPlayServicesUpdateDialog ?? true }),
    signIn: () => native.signIn(),
    signOut: () => native.signOut(),
    hasPreviousSignIn: () => native.hasPreviousSignIn(),
    getCurrentUser: () => native.getCurrentUser(),
    isSignedIn: () => native.hasPreviousSignIn(),
  };
}

const usesMockGoogleAuth =
  Platform.OS === 'web' || Constants.appOwnership === AppOwnership.Expo;

let googleAuthSingleton: { bridge: GoogleAuthBridge; statusCodes: GoogleAuthStatusCodes } | null =
  null;

function resolveGoogleAuth(): { bridge: GoogleAuthBridge; statusCodes: GoogleAuthStatusCodes } {
  if (googleAuthSingleton) {
    return googleAuthSingleton;
  }
  if (!usesMockGoogleAuth) {
    try {
      const nativeModule = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
      nativeModule.GoogleSignin.configure(GOOGLE_AUTH_CONFIG);
      googleAuthSingleton = {
        bridge: buildRealBridge(nativeModule.GoogleSignin),
        statusCodes: nativeModule.statusCodes,
      };
      return googleAuthSingleton;
    } catch (error) {
      console.warn(
        '[google-auth] Native Google Sign-In module is unavailable; falling back to mock. Google Sign-In requires a standalone build.',
        error
      );
    }
  }
  googleAuthSingleton = {
    bridge: MOCK_GOOGLE_AUTH,
    statusCodes: LOCAL_STATUS_CODES,
  };
  return googleAuthSingleton;
}

export const statusCodes: GoogleAuthStatusCodes = resolveGoogleAuth().statusCodes;

export function getGoogleAuth(): GoogleAuthBridge {
  return resolveGoogleAuth().bridge;
}