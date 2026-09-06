import * as React from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { Color, Border } from "../theme/GlobalStyles";

const CATEGORIES = ["Recent", "Top 50", "Chill", "R&B", "Festival"];

const FEATURED_MIXES = [
  { id: "1", title: "R&B Playlist", subtitle: "Chill your mind", color: Color.accent },
  { id: "2", title: "Daily Mix 2", subtitle: "Made for you", color: "#2B4B7A" },
];

const FAVORITES = [
  {
    id: "1",
    title: "Bye Bye",
    artist: "Marshmello, Juice WRLD",
    duration: "2:09",
    color: "#E05A47",
  },
  {
    id: "2",
    title: "I Like You",
    artist: "Post Malone, Doja Cat",
    duration: "4:03",
    color: "#F3A953",
  },
  {
    id: "3",
    title: "Fountains",
    artist: "Drake, Tems",
    duration: "3:18",
    color: "#3B82F6",
  },
];

export const Screen2: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = React.useState("Recent");
  const [searchQuery, setSearchQuery] = React.useState("");

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.greetingTitle}>Welcome back!</Text>
            <Text style={styles.greetingSubtitle}>
              What do you feel like today?
            </Text>

            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search song, playlist, artist..."
                placeholderTextColor={Color.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            {CATEGORIES.map((category) => {
              const isActive = selectedCategory === category;
              return (
                <TouchableOpacity
                  key={category}
                  onPress={() => setSelectedCategory(category)}
                  style={styles.categoryTab}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      isActive && styles.categoryTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                  {isActive && <View style={styles.activeIndicator} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.featuredGrid}>
            {FEATURED_MIXES.map((mix) => (
              <TouchableOpacity
                key={mix.id}
                style={[styles.featuredCard, { backgroundColor: mix.color }]}
                activeOpacity={0.8}
              >
                <Text style={styles.cardTitle}>{mix.title}</Text>
                <Text style={styles.cardSubtitle}>{mix.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your favourites</Text>
            <View style={styles.trackList}>
              {FAVORITES.map((track) => (
                <TouchableOpacity
                  key={track.id}
                  style={styles.trackRow}
                  activeOpacity={0.7}
                >
                  <View
                    style={[styles.trackArtwork, { backgroundColor: track.color }]}
                  />
                  <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </View>
                  <Text style={styles.trackDuration}>{track.duration}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Color.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 24,
  },
  header: {
    gap: 6,
  },
  greetingTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: Color.textPrimary,
  },
  greetingSubtitle: {
    fontSize: 13,
    color: Color.textSecondary,
    fontWeight: "500",
  },
  searchContainer: {
    marginTop: 12,
  },
  searchInput: {
    height: 42,
    backgroundColor: Color.surface,
    borderRadius: Border.sm,
    paddingHorizontal: 14,
    color: Color.textPrimary,
    fontSize: 13,
  },
  categoryRow: {
    flexDirection: "row",
    gap: 20,
    paddingVertical: 4,
  },
  categoryTab: {
    alignItems: "center",
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Color.textSecondary,
  },
  categoryTextActive: {
    color: Color.textPrimary,
  },
  activeIndicator: {
    marginTop: 4,
    height: 2,
    width: "100%",
    backgroundColor: Color.accent,
    borderRadius: 1,
  },
  featuredGrid: {
    flexDirection: "row",
    gap: 12,
  },
  featuredCard: {
    flex: 1,
    height: 120,
    borderRadius: Border.md,
    padding: 14,
    justifyContent: "flex-end",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Color.textPrimary,
  },
  cardSubtitle: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.75)",
    marginTop: 2,
  },
  section: {
    gap: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Color.textPrimary,
  },
  trackList: {
    gap: 10,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    padding: 10,
    borderRadius: Border.md,
    gap: 12,
  },
  trackArtwork: {
    width: 42,
    height: 42,
    borderRadius: Border.sm,
  },
  trackInfo: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Color.textPrimary,
  },
  trackArtist: {
    fontSize: 11,
    color: Color.textSecondary,
  },
  trackDuration: {
    fontSize: 12,
    color: Color.textSecondary,
  },
});

export default Screen2;