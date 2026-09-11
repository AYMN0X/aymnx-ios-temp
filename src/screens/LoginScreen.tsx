import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../theme/appTheme';

export function LoginScreen() {
  const { login, signUp, loginGuest, signInWithGoogle } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const toggleMode = () => {
    setIsSignUp((v) => !v);
    setErrorMsg('');
    setConfirmPassword('');
    setPassword('');
  };

  const handleSubmit = async () => {
    if (submitting || !identifier.trim()) {
      return;
    }
    if (isSignUp && !displayName.trim()) {
      setErrorMsg('Please enter a display name.');
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setErrorMsg('');
    setSubmitting(true);
    try {
      const result = isSignUp
        ? await signUp(displayName, identifier, password)
        : await login(identifier, password);
      if (!result.ok) {
        setErrorMsg(result.error ?? 'Something went wrong.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleSubmitting || submitting) {
      return;
    }
    setErrorMsg('');
    setGoogleSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (!result.ok) {
        setErrorMsg(result.error ?? 'Something went wrong.');
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const fieldDisabled = !identifier.trim() || submitting || password.length === 0;
  const submitLabel = isSignUp ? 'Create Account' : 'Log In';

  return (
    <View style={styles.loginRoot}>
      <ScrollView
        style={styles.loginScroll}
        contentContainerStyle={styles.loginContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.loginTitle}>{"Millions of songs.\nFree on AYMNX."}</Text>

        <Pressable
          style={[styles.googleButton, (googleSubmitting || submitting) && styles.disabled]}
          onPress={handleGoogleSignIn}
          disabled={googleSubmitting || submitting}
        >
          <Ionicons name="logo-google" size={18} color="#FFFFFF" />
          <Text style={styles.googleButtonLabel}>
            {googleSubmitting ? 'Signing in\u2026' : 'Continue with Google'}
          </Text>
        </Pressable>

        <View style={styles.orContainer}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.orLine} />
        </View>

        {isSignUp && (
          <TextInput
            style={[styles.loginInput, styles.loginField]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display Name"
            placeholderTextColor={COLORS.placeholder}
            autoCapitalize="words"
            autoCorrect={false}
          />
        )}

        <TextInput
          style={[styles.loginInput, styles.loginField]}
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="Email"
          placeholderTextColor={COLORS.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        <View style={[styles.loginPasswordWrap, styles.loginField]}>
          <TextInput
            style={styles.loginPasswordInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={COLORS.placeholder}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={styles.loginPasswordToggle}
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={8}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={COLORS.textSecondary}
            />
          </Pressable>
        </View>

        {isSignUp && (
          <TextInput
            style={[styles.loginInput, styles.loginField]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm Password"
            placeholderTextColor={COLORS.placeholder}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
          />
        )}

        {errorMsg ? <Text style={styles.loginError}>{errorMsg}</Text> : null}

        <Pressable
          style={[styles.loginButton, fieldDisabled && styles.disabled]}
          onPress={handleSubmit}
          disabled={fieldDisabled}
        >
          <Text style={styles.loginButtonLabel}>
            {submitting ? 'Please wait\u2026' : submitLabel}
          </Text>
        </Pressable>

        <Pressable style={styles.loginGuest} onPress={loginGuest} hitSlop={8}>
          <Text style={styles.loginGuestLabel}>Continue as Guest</Text>
        </Pressable>

        <Pressable style={styles.loginToggle} onPress={toggleMode} hitSlop={8}>
          <Text style={styles.loginToggleText}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          </Text>
          <Text style={styles.loginToggleLink}>{isSignUp ? 'Log in' : 'Sign up'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loginRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loginScroll: {
    flex: 1,
    width: '100%',
    backgroundColor: COLORS.background,
  },
  loginContent: {
    flexGrow: 1,
    width: '100%',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  loginTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 36,
  },
  loginField: {
    marginTop: 12,
  },
  loginInput: {
    width: '100%',
    height: 50,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 16,
  },
  loginPasswordWrap: {
    width: '100%',
    position: 'relative',
  },
  loginPasswordInput: {
    width: '100%',
    height: 50,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingRight: 44,
    color: '#FFFFFF',
    fontSize: 16,
  },
  loginPasswordToggle: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  loginError: {
    color: '#FF5252',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  loginButton: {
    width: '100%',
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  loginButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loginGuest: {
    marginTop: 24,
    padding: 8,
  },
  loginGuestLabel: {
    color: '#8A8F9D',
    fontSize: 14,
    fontWeight: '600',
  },
  loginToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    padding: 8,
  },
  loginToggleText: {
    color: '#8A8F9D',
    fontSize: 14,
    fontWeight: '500',
  },
  loginToggleLink: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
  googleButton: {
    width: '100%',
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 25,
    gap: 10,
  },
  googleButtonLabel: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  orContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.inputBorder,
  },
  orText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 10,
  },
});