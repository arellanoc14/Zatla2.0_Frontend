import React, { createContext, useContext } from 'react';

// ZATLA has no accounts: the Studio is open to everyone and designs live in the
// visitor's browser (see lib/growroom/localDesign.js). This keeps the useAuth()
// shape the studio components already read, with no user and no server calls.
const value = {
  user: null,
  isAuthenticated: false,
  isLoadingAuth: false,
  isLoadingPublicSettings: false,
  appPublicSettings: null,
  authError: null,
  authChecked: true,
  logout: () => {},
  navigateToLogin: () => {},
  checkUserAuth: async () => {},
  checkAppState: async () => {},
};

const AuthContext = createContext(value);

export const AuthProvider = ({ children }) => (
  <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
);

export const useAuth = () => useContext(AuthContext);
