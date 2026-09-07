import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../theme/appTheme';

export function LoginScreen() {
  const { login, signUp, loginGuest } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

        {isSignUp && (
          <TextInput
            style={[styles.loginInput, styles.loginField]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display Name"
            placeholderTextColor="#777777"
            autoCapitalize="words"
            autoCorrect={false}
          />
        )}

        <TextInput
          style={[styles.loginInput, styles.loginField]}
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="Username or Email"
          placeholderTextColor="#777777"
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
            placeholderTextColor="#777777"
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
              color="#B3B3B3"
            />
          </Pressable>
        </View>

        {isSignUp && (
          <TextInput
            style={[styles.loginInput, styles.loginField]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm Password"
            placeholderTextColor="#777777"
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
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loginScroll: {
    flex: 1,
    width: '100%',
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
    backgroundColor: '#282828',
    borderRadius: 8,
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
    backgroundColor: '#282828',
    borderRadius: 8,
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
    color: '#B3B3B3',
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
    color: '#B3B3B3',
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
});