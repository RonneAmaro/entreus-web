"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { supabase } from "@/lib/supabase";
import AppSidebar from "../../components/AppSidebar";
import MobileNavigation from "../../components/MobileNavigation";
import BrandHeader from "../../components/BrandHeader";
import PostCard from "../../components/PostCard";
import UserBadges from "../../components/UserBadges";
import UserBadgesPanel from "../../components/UserBadgesPanel";
import UserTierBadge from "../../components/UserTierBadge";
import ProfileAvatarFrame from "../../components/ProfileAvatarFrame";
import { getUserTierSurfaceClassName } from "../../components/UserTierFrame";
import StartConversationButton from "../../components/StartConversationButton";
import GiftModal from "../../components/GiftModal";
import TipModal from "../../components/TipModal";
import GiftShowcase, { type GiftShowcaseItem } from "../../components/GiftShowcase";
import { Coins, ExternalLink, Flag, Gift, Loader2, MapPin, Maximize2, Search, UserCheck, UserPlus, UserX, X } from "lucide-react";
import {
  type ModeratedPostFields,
} from "@/lib/post-moderation";
import { resolveUserTier } from "@/lib/user-tiers";
import {
  getEffectiveProfileThemeKey,
  getProfileTheme,
} from "@/lib/profile-themes";
import { canViewAdultContent } from "@/lib/content-access";
import { useLanguage } from "../../components/LanguageProvider";
import {
  getExclusiveAccessState,
  isExclusiveCreatorProfilePost,
  isPublicCreatorProfilePost,
} from "@/lib/creator-profile-access";

type VisibilityType = "public" | "followers" | "private";
type ProfileTab = "posts" | "exclusive";

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  website_url: string | null;
  website_title: string | null;
  show_sensitive_content?: boolean | null;
  is_minor?: boolean | null;
  wants_18_plus?: boolean | null;
  age_verification_status?: string | null;
  vip_status?: string | null;
  vip_expires_at?: string | null;
  profile_theme?: string | null;
};

type UserBadgeRow = {
  badges: { slug?: string | null } | { slug?: string | null }[] | null;
};

type ProfileSummary = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  vip_status?: string | null;
  vip_expires_at?: string | null;
  profile_theme?: string | null;
};

type PostMedia = {
  id: string;
  post_id: string;
  user_id: string;
  media_url: string | null;
  media_type: "image" | "video" | "gif";
  position: number;
  created_at?: string;
  access_level?: string | null;
};

type Post = ModeratedPostFields & {
  id: string;
  content: string | null;
  category: string | null;
  created_at: string;
  user_id: string;
  image_url: string | null;
  video_url: string | null;
  visibility: VisibilityType;
  is_sensitive: boolean | null;
  community_type?: string | null;
  content_rating?: string | null;
  is_paid?: boolean | null;
  price_itacash?: number | null;
  paid_unlocked?: boolean;
  profiles: ProfileSummary | null;
  media?: PostMedia[];
};

type FollowProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type Like = {
  id: string;
  post_id: string;
  user_id: string;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
};

type BookmarkItem = {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
};

type Repost = {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
  profiles: ProfileSummary | null;
};

type FeedItem =
  | {
    type: "post";
    id: string;
    created_at: string;
    post: Post;
  }
  | {
    type: "repost";
    id: string;
    created_at: string;
    post: Post;
    repost: Repost;
  };

const PROFILE_SELECT_WITH_THEME =
  "id, username, display_name, bio, avatar_url, banner_url, country, city, state, website_url, website_title, show_sensitive_content, is_minor, wants_18_plus, age_verification_status, vip_status, vip_expires_at, profile_theme";
const PROFILE_SELECT_FALLBACK =
  "id, username, display_name, bio, avatar_url, banner_url, country, city, state, website_url, website_title, show_sensitive_content, is_minor, wants_18_plus, age_verification_status, vip_status, vip_expires_at";
function isMissingProfileThemeColumnError(error: { message?: string } | null) {
  return Boolean(error?.message && /profile_theme/i.test(error.message));
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { language, t } = useLanguage();
  const username = typeof params.username === "string" ? params.username : "";

  const [mounted, setMounted] = useState(false);
  const [loggedUserId, setLoggedUserId] = useState("");
  const [email, setEmail] = useState("");
  const [loggedProfile, setLoggedProfile] = useState<Profile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileBadgeSlugs, setProfileBadgeSlugs] = useState<string[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  const [posts, setPosts] = useState<Post[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [reposts, setReposts] = useState<Repost[]>([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const [followLoading, setFollowLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [reportingUser, setReportingUser] = useState(false);
  const [reportedUser, setReportedUser] = useState(false);

  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);

  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([]);

  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [followersList, setFollowersList] = useState<FollowProfile[]>([]);
  const [followingList, setFollowingList] = useState<FollowProfile[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileTab>("posts");
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [tipModalOpen, setTipModalOpen] = useState(false);
  const [receivedGifts, setReceivedGifts] = useState<GiftShowcaseItem[]>([]);
  const [sharingGiftId, setSharingGiftId] = useState<string | null>(null);
  const [giftToShare, setGiftToShare] = useState<GiftShowcaseItem | null>(null);
  const [shareGiftText, setShareGiftText] = useState("");
  const [shareGiftMediaFailed, setShareGiftMediaFailed] = useState(false);

  const profileTier = useMemo(
    () => resolveUserTier({
      vipStatus: profile?.vip_status,
      vipExpiresAt: profile?.vip_expires_at,
      badgeSlugs: profileBadgeSlugs,
    }),
    [profile, profileBadgeSlugs],
  );
  const effectiveProfileThemeKey = useMemo(
    () => getEffectiveProfileThemeKey(profile?.profile_theme, profileTier),
    [profile?.profile_theme, profileTier],
  );
  const effectiveProfileTheme = useMemo(
    () => getProfileTheme(effectiveProfileThemeKey),
    [effectiveProfileThemeKey],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    async function loadPage() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setLoggedUserId(user?.id || "");
      setEmail(user?.email || "");

      let normalizedLoggedProfile: Profile | null = null;

      if (user) {
        let { data: loggedProfileData, error: loggedProfileError } = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_WITH_THEME)
          .eq("id", user.id)
          .maybeSingle();

        if (isMissingProfileThemeColumnError(loggedProfileError)) {
          const fallbackResult = await supabase
            .from("profiles")
            .select(PROFILE_SELECT_FALLBACK)
            .eq("id", user.id)
            .maybeSingle();

          loggedProfileData = fallbackResult.data
            ? { ...fallbackResult.data, profile_theme: "default" }
            : null;
          loggedProfileError = fallbackResult.error;
        }

        normalizedLoggedProfile = loggedProfileData
          ? {
              ...loggedProfileData,
              is_minor: loggedProfileData.is_minor,
              show_sensitive_content: canViewAdultContent({
                isMinor: loggedProfileData.is_minor,
                wants18Plus: loggedProfileData.wants_18_plus,
                ageVerificationStatus: loggedProfileData.age_verification_status,
              }),
            }
          : null;
      }

      setLoggedProfile(normalizedLoggedProfile);

      if (!username) {
        setMessage(t("publicProfile.errors.invalidUser"));
        setLoading(false);
        return;
      }

      let { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT_WITH_THEME)
        .eq("username", username)
        .maybeSingle();

      if (isMissingProfileThemeColumnError(profileError)) {
        const fallbackResult = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_FALLBACK)
          .eq("username", username)
          .maybeSingle();

        profileData = fallbackResult.data
          ? { ...fallbackResult.data, profile_theme: "default" }
          : null;
        profileError = fallbackResult.error;
      }

      if (profileError) {
        setMessage(t("publicProfile.errors.loadProfile"));
        setLoading(false);
        return;
      }

      if (!profileData) {
        setMessage(t("publicProfile.errors.notFound"));
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: profileBadgesData } = await supabase
        .from("user_badges")
        .select("badges ( slug )")
        .eq("user_id", profileData.id);

      const badgeSlugs = ((profileBadgesData || []) as UserBadgeRow[])
        .flatMap((row) => Array.isArray(row.badges) ? row.badges : [row.badges])
        .map((badge) => badge?.slug || "")
        .filter(Boolean);
      setProfileBadgeSlugs(badgeSlugs);

      const currentUserId = user?.id || "";
      const isOwn = currentUserId === profileData.id;

      let blockedByMe = false;
      let blockedMe = false;
      let currentFollowData: { id: string } | null = null;

      if (currentUserId && !isOwn) {
        const { data: blockedByMeData, error: blockedByMeError } =
          await supabase
            .from("blocks")
            .select("id")
            .eq("blocker_id", currentUserId)
            .eq("blocked_id", profileData.id)
            .maybeSingle();

        if (blockedByMeError) {
          setMessage(t("publicProfile.errors.checkBlock"));
          setLoading(false);
          return;
        }

        const { data: hasBlockedMeData, error: hasBlockedMeError } =
          await supabase
            .from("blocks")
            .select("id")
            .eq("blocker_id", profileData.id)
            .eq("blocked_id", currentUserId)
            .maybeSingle();

        if (hasBlockedMeError) {
          setMessage(t("publicProfile.errors.checkBlock"));
          setLoading(false);
          return;
        }

        blockedByMe = !!blockedByMeData;
        blockedMe = !!hasBlockedMeData;

        setIsBlockedByMe(blockedByMe);
        setHasBlockedMe(blockedMe);

        if (!blockedByMe && !blockedMe) {
          const { data: followData } = await supabase
            .from("follows")
            .select("id")
            .eq("follower_id", currentUserId)
            .eq("following_id", profileData.id)
            .maybeSingle();

          currentFollowData = followData || null;
          setIsFollowing(!!followData);
        }
      }

      if (!blockedByMe && !blockedMe) {
        await Promise.all([
          loadPublicProfileActivity(
            profileData,
            currentUserId,
            isOwn,
            !!currentFollowData,
            normalizedLoggedProfile?.show_sensitive_content || false,
            normalizedLoggedProfile,
          ),
          loadCounts(profileData.id),
          loadLikes(),
          loadComments(),
          currentUserId ? loadBookmarks(currentUserId) : Promise.resolve(),
          loadAllReposts(profileData),
          currentUserId ? loadUnreadNotificationsCount(currentUserId) : Promise.resolve(),
          loadPublicReceivedGifts(profileData.id),
        ]);
      } else {
        setPosts([]);
        setFollowersCount(0);
        setFollowingCount(0);
        setIsFollowing(false);
        setReceivedGifts([]);
      }

      if (currentUserId) {
        await loadUnreadNotificationsCount(currentUserId);
      }

      setLoading(false);
    }

    loadPage();
  }, [username, router]);

  async function loadUnreadNotificationsCount(currentUserId: string) {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", currentUserId)
      .eq("read", false);

    if (error) {
      setMessage(t("publicProfile.errors.loadNotifications"));
      return;
    }

    setUnreadNotificationsCount(count || 0);
  }

  async function loadCounts(profileId: string) {
    const { data: followersData, error: followersError } = await supabase
      .from("follows")
      .select("id")
      .eq("following_id", profileId);

    if (followersError) {
      setMessage(t("publicProfile.errors.loadFollowers"));
      return;
    }

    setFollowersCount(followersData?.length || 0);

    const { data: followingData, error: followingError } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", profileId);

    if (followingError) {
      setMessage(t("publicProfile.errors.loadFollowing"));
      return;
    }

    setFollowingCount(followingData?.length || 0);
  }

  async function loadPublicReceivedGifts(profileId: string) {
    type GiftRow = {
      id: string;
      gift_id: string;
      sender_id: string;
      message: string | null;
      price_paid_itacash: number;
      created_at: string;
    };

    type DigitalGiftRow = {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      media_url: string | null;
      media_type: string | null;
    };

    type SenderProfileRow = {
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    };

    const { data, error } = await supabase
      .from("user_gifts")
      .select("id, gift_id, sender_id, message, price_paid_itacash, created_at")
      .eq("receiver_id", profileId)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      console.error("Erro ao carregar presentes recebidos:", error.message);
      setReceivedGifts([]);
      return;
    }

    const giftRows = (data || []) as GiftRow[];

    if (giftRows.length === 0) {
      setReceivedGifts([]);
      return;
    }

    const giftIds = Array.from(new Set(giftRows.map((item) => item.gift_id)));
    const senderIds = Array.from(new Set(giftRows.map((item) => item.sender_id)));

    const [giftsResult, sendersResult] = await Promise.all([
      giftIds.length > 0
        ? supabase
            .from("digital_gifts")
            .select("id, name, slug, description, media_url, media_type")
            .in("id", giftIds)
        : Promise.resolve({ data: [], error: null }),
      senderIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .in("id", senderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (giftsResult.error) {
      console.error("Erro ao carregar catalogo de presentes:", giftsResult.error.message);
    }

    if (sendersResult.error) {
      console.error("Erro ao carregar remetentes dos presentes:", sendersResult.error.message);
    }

    const giftsById = ((giftsResult.data || []) as DigitalGiftRow[]).reduce<
      Record<string, DigitalGiftRow>
    >((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    const sendersById = ((sendersResult.data || []) as SenderProfileRow[]).reduce<
      Record<string, SenderProfileRow>
    >((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    setReceivedGifts(
      giftRows.map((item) => ({
        id: item.id,
        message: item.message,
        price_paid_itacash: item.price_paid_itacash,
        created_at: item.created_at,
        gift: giftsById[item.gift_id] || null,
        sender: sendersById[item.sender_id] || null,
      })),
    );
  }

  async function loadLikes() {
    const { data, error } = await supabase
      .from("likes")
      .select("id, post_id, user_id");

    if (error) {
      setMessage(t("publicProfile.errors.loadLikes"));
      return;
    }

    setLikes(data || []);
  }

  async function loadComments() {
    const { data, error } = await supabase
      .from("comments")
      .select("id, post_id, user_id");

    if (error) {
      setMessage(t("publicProfile.errors.loadComments"));
      return;
    }

    setComments(data || []);
  }

  async function loadBookmarks(currentUserId: string = loggedUserId) {
    if (!currentUserId) return;

    const { data, error } = await supabase
      .from("bookmarks")
      .select("id, post_id, user_id, created_at")
      .eq("user_id", currentUserId);

    if (error) {
      setMessage(t("publicProfile.errors.loadBookmarks"));
      return;
    }

    setBookmarks(data || []);
  }

  async function loadAllReposts(profileData: Profile | null = profile) {
    const { data, error } = await supabase
      .from("reposts")
      .select("id, post_id, user_id, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(t("publicProfile.errors.loadReposts"));
      return;
    }

    const rawReposts = data || [];

    const repostUserIds = Array.from(
      new Set(rawReposts.map((repost) => repost.user_id).filter(Boolean)),
    );

    let profilesById: Record<string, ProfileSummary> = {};

    if (repostUserIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", repostUserIds);

      if (profilesError) {
        console.error(
          "Erro ao carregar perfis dos reposts:",
          profilesError.message,
        );
      }

      profilesById = (
        (profilesData || []) as (ProfileSummary & { id: string })[]
      ).reduce(
        (acc, item) => {
          acc[item.id] = {
            username: item.username,
            display_name: item.display_name,
            avatar_url: item.avatar_url,
          };

          return acc;
        },
        {} as Record<string, ProfileSummary>,
      );
    }

    const normalizedReposts: Repost[] = rawReposts.map((repost) => ({
      ...repost,
      profiles:
        profilesById[repost.user_id] ||
        (profileData && repost.user_id === profileData.id
          ? {
            username: profileData.username,
            display_name: profileData.display_name,
            avatar_url: profileData.avatar_url,
          }
          : null),
    }));

    setReposts(normalizedReposts);
  }

  async function loadPublicProfileActivity(
    profileData: Profile,
    currentUserId: string,
    isOwn: boolean,
    currentIsFollowing: boolean,
    allowSensitiveContent: boolean,
    viewerProfile: Profile | null = loggedProfile,
  ) {
    void currentUserId;
    void isOwn;
    void currentIsFollowing;
    void allowSensitiveContent;
    void viewerProfile;

    const headers: Record<string, string> = {};
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`/api/creator-profile/${encodeURIComponent(profileData.username)}/posts`, {
      headers,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as {
      error?: string;
      posts?: Post[];
      reposts?: Repost[];
    } | null;

    if (!response.ok || !payload) {
      setMessage(t("publicProfile.errors.loadPosts"));
      setPosts([]);
      return;
    }

    setPosts(payload.posts || []);
    setReposts((current) => {
      const otherReposts = current.filter(
        (repost) => repost.user_id !== profileData.id,
      );
      return [...otherReposts, ...(payload.reposts || [])];
    });
  }

  async function refreshProfileState(profileId: string, currentUserId: string) {
    if (!profile) return;

    const isOwn = currentUserId === profileId;

    let currentIsFollowing = isFollowing;

    if (!isOwn) {
      const { data: blockedByMeData } = await supabase
        .from("blocks")
        .select("id")
        .eq("blocker_id", currentUserId)
        .eq("blocked_id", profileId)
        .maybeSingle();

      const { data: hasBlockedMeData } = await supabase
        .from("blocks")
        .select("id")
        .eq("blocker_id", profileId)
        .eq("blocked_id", currentUserId)
        .maybeSingle();

      const blockedByMe = !!blockedByMeData;
      const blockedMe = !!hasBlockedMeData;

      setIsBlockedByMe(blockedByMe);
      setHasBlockedMe(blockedMe);

      if (blockedByMe || blockedMe) {
        setPosts([]);
        setFollowersCount(0);
        setFollowingCount(0);
        setIsFollowing(false);
        return;
      }

      const { data: followData } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", currentUserId)
        .eq("following_id", profileId)
        .maybeSingle();

      currentIsFollowing = !!followData;
      setIsFollowing(currentIsFollowing);
    }

    await Promise.all([
      loadPublicProfileActivity(
        profile,
        currentUserId,
        isOwn,
        currentIsFollowing,
        loggedProfile?.show_sensitive_content || false,
      ),
      loadCounts(profileId),
      loadAllReposts(profile),
    ]);
  }

  async function handleToggleFollow() {
    if (!profile || !loggedUserId) return;
    if (loggedUserId === profile.id) return;
    if (isBlockedByMe || hasBlockedMe) {
      setMessage(t("publicProfile.errors.followBlocked"));
      return;
    }

    setFollowLoading(true);
    setMessage("");

    const { data: existingFollow, error: checkError } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", loggedUserId)
      .eq("following_id", profile.id)
      .maybeSingle();

    if (checkError) {
      setMessage(t("publicProfile.errors.checkFollow"));
      setFollowLoading(false);
      return;
    }

    if (existingFollow) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("id", existingFollow.id);

      if (error) {
        setMessage(t("publicProfile.errors.unfollow"));
        setFollowLoading(false);
        return;
      }
    } else {
      const { error } = await supabase.from("follows").insert({
        follower_id: loggedUserId,
        following_id: profile.id,
      });

      if (error) {
        setMessage(t("publicProfile.errors.follow"));
        setFollowLoading(false);
        return;
      }

      await supabase.from("notifications").insert({
        user_id: profile.id,
        actor_id: loggedUserId,
        type: "follow",
      });
    }

    await refreshProfileState(profile.id, loggedUserId);
    setFollowLoading(false);
  }

  async function handleToggleBlock() {
    if (!profile || !loggedUserId) return;
    if (loggedUserId === profile.id) return;

    setBlockLoading(true);
    setMessage("");

    if (isBlockedByMe) {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", loggedUserId)
        .eq("blocked_id", profile.id);

      if (error) {
        setMessage(t("publicProfile.errors.unblock"));
        setBlockLoading(false);
        return;
      }

      setMessage(t("publicProfile.success.unblocked"));
    } else {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", loggedUserId)
        .eq("following_id", profile.id);

      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", profile.id)
        .eq("following_id", loggedUserId);

      const { error } = await supabase.from("blocks").insert({
        blocker_id: loggedUserId,
        blocked_id: profile.id,
      });

      if (error) {
        setMessage(t("publicProfile.errors.block"));
        setBlockLoading(false);
        return;
      }

      setMessage(t("publicProfile.success.blocked"));
    }

    await refreshProfileState(profile.id, loggedUserId);
    setBlockLoading(false);
  }

  async function handleReportUser() {
    if (!profile || !loggedUserId) return;
    if (loggedUserId === profile.id) {
      setMessage(t("publicProfile.errors.reportOwnProfile"));
      return;
    }

    const reason = window.prompt(
      t("publicProfile.reportProfilePrompt"),
    );

    if (!reason || !reason.trim()) return;

    setReportingUser(true);
    setMessage("");

    const { error } = await supabase.from("reports").insert({
      reporter_id: loggedUserId,
      reported_user_id: profile.id,
      reason: reason.trim(),
    });

    if (error) {
      setMessage(t("publicProfile.errors.reportUser"));
      setReportingUser(false);
      return;
    }

    setReportedUser(true);
    setMessage(t("publicProfile.success.reportedUser"));
    setReportingUser(false);
  }

  async function handleToggleBookmark(postId: string) {
    if (!loggedUserId) return;

    const existingBookmark = bookmarks.find(
      (bookmark) =>
        bookmark.post_id === postId && bookmark.user_id === loggedUserId,
    );

    if (existingBookmark) {
      setBookmarks((current) =>
        current.filter((bookmark) => bookmark.id !== existingBookmark.id),
      );

      const { error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", loggedUserId);

      if (error) {
        setMessage(t("publicProfile.errors.removeBookmark"));
        await loadBookmarks(loggedUserId);
      }

      return;
    }

    const optimisticBookmark: BookmarkItem = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: loggedUserId,
      created_at: new Date().toISOString(),
    };

    setBookmarks((current) => [...current, optimisticBookmark]);

    const { data, error } = await supabase
      .from("bookmarks")
      .insert({
        post_id: postId,
        user_id: loggedUserId,
      })
      .select("id, post_id, user_id, created_at")
      .single();

    if (error) {
      setMessage(t("publicProfile.errors.savePost"));
      await loadBookmarks(loggedUserId);
      return;
    }

    if (data) {
      setBookmarks((current) =>
        current.map((bookmark) =>
          bookmark.id === optimisticBookmark.id ? data : bookmark,
        ),
      );
    }
  }

  async function handleToggleRepost(postId: string) {
    if (!loggedUserId || !loggedProfile) return;

    const repostedPost = posts.find((post) => post.id === postId);

    if (repostedPost?.user_id === loggedUserId) {
      setMessage(t("publicProfile.errors.repostOwn"));
      return;
    }

    const existingRepost = reposts.find(
      (repost) => repost.post_id === postId && repost.user_id === loggedUserId,
    );

    if (existingRepost) {
      setReposts((current) =>
        current.filter((repost) => repost.id !== existingRepost.id),
      );

      const { error } = await supabase
        .from("reposts")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", loggedUserId);

      if (error) {
        setMessage(t("publicProfile.errors.removeRepost"));
        if (profile) await loadAllReposts(profile);
      }

      return;
    }

    const optimisticRepost: Repost = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: loggedUserId,
      created_at: new Date().toISOString(),
      profiles: {
        username: loggedProfile.username,
        display_name: loggedProfile.display_name,
        avatar_url: loggedProfile.avatar_url,
      },
    };

    setReposts((current) => [optimisticRepost, ...current]);

    const { data, error } = await supabase
      .from("reposts")
      .insert({
        post_id: postId,
        user_id: loggedUserId,
      })
      .select("id, post_id, user_id, created_at")
      .single();

    if (error) {
      setMessage(t("publicProfile.errors.repost"));
      if (profile) await loadAllReposts(profile);
      return;
    }

    if (data) {
      setReposts((current) =>
        current.map((repost) =>
          repost.id === optimisticRepost.id
            ? {
              ...data,
              profiles: optimisticRepost.profiles,
            }
            : repost,
        ),
      );
    }

    if (repostedPost && repostedPost.user_id !== loggedUserId) {
      await supabase.from("notifications").insert({
        user_id: repostedPost.user_id,
        actor_id: loggedUserId,
        type: "repost",
        post_id: postId,
      });
    }
  }

  async function handleToggleLike(postId: string) {
    if (!loggedUserId) return;

    const existingLike = likes.find(
      (like) => like.post_id === postId && like.user_id === loggedUserId,
    );

    if (existingLike) {
      setLikes((current) =>
        current.filter((like) => like.id !== existingLike.id),
      );

      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("id", existingLike.id);

      if (error) {
        setMessage(t("publicProfile.errors.removeLike"));
        await loadLikes();
      }

      return;
    }

    const optimisticLike: Like = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: loggedUserId,
    };

    setLikes((current) => [...current, optimisticLike]);

    const { data, error } = await supabase
      .from("likes")
      .insert({
        post_id: postId,
        user_id: loggedUserId,
      })
      .select("id, post_id, user_id")
      .single();

    if (error) {
      setMessage(t("publicProfile.errors.like"));
      await loadLikes();
      return;
    }

    if (data) {
      setLikes((current) =>
        current.map((like) => (like.id === optimisticLike.id ? data : like)),
      );
    }

    const likedPost = posts.find((post) => post.id === postId);

    if (likedPost && likedPost.user_id !== loggedUserId) {
      await supabase.from("notifications").insert({
        user_id: likedPost.user_id,
        actor_id: loggedUserId,
        type: "like",
        post_id: postId,
      });
    }
  }

  async function handleCopyPostLink(postId: string) {
    const url = `${window.location.origin}/post/${postId}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopiedPostId(postId);

      setTimeout(() => {
        setCopiedPostId((current) => (current === postId ? null : current));
      }, 2000);
    } catch {
      setMessage(t("publicProfile.errors.copyPostLink"));
    }
  }

  async function handleReportPost(postId: string, postOwnerId: string) {
    if (!loggedUserId) return;

    if (postOwnerId === loggedUserId) {
      setMessage(t("publicProfile.errors.reportOwnPost"));
      return;
    }

    const reason = window.prompt(
      t("publicProfile.reportPostPrompt"),
    );

    if (!reason || !reason.trim()) return;

    setReportingPostId(postId);
    setMessage("");

    const { error } = await supabase.from("reports").insert({
      reporter_id: loggedUserId,
      reported_post_id: postId,
      reported_user_id: postOwnerId,
      reason: reason.trim(),
    });

    if (error) {
      setMessage(t("publicProfile.errors.reportPost"));
      setReportingPostId(null);
      return;
    }

    setReportedPostIds((prev) => [...prev, postId]);
    setMessage(t("publicProfile.success.reportedPost"));
    setReportingPostId(null);
  }

  async function loadFollowersList() {
    if (!profile) return;

    setLoadingFollowers(true);

    const { data: followsData, error: followsError } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("following_id", profile.id);

    if (followsError) {
      setMessage(t("publicProfile.errors.loadFollowers"));
      setLoadingFollowers(false);
      return;
    }

    const followerIds = (followsData || [])
      .map((item) => item.follower_id)
      .filter(Boolean);

    if (followerIds.length === 0) {
      setFollowersList([]);
      setLoadingFollowers(false);
      return;
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", followerIds);

    if (profilesError) {
      setMessage(t("publicProfile.errors.loadFollowers"));
      setLoadingFollowers(false);
      return;
    }

    setFollowersList(profilesData || []);
    setLoadingFollowers(false);
  }

  async function loadFollowingList() {
    if (!profile) return;

    setLoadingFollowing(true);

    const { data: followsData, error: followsError } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", profile.id);

    if (followsError) {
      setMessage(t("publicProfile.errors.loadFollowing"));
      setLoadingFollowing(false);
      return;
    }

    const followingIds = (followsData || [])
      .map((item) => item.following_id)
      .filter(Boolean);

    if (followingIds.length === 0) {
      setFollowingList([]);
      setLoadingFollowing(false);
      return;
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", followingIds);

    if (profilesError) {
      setMessage(t("publicProfile.errors.loadFollowing"));
      setLoadingFollowing(false);
      return;
    }

    setFollowingList(profilesData || []);
    setLoadingFollowing(false);
  }

  async function handleOpenFollowers() {
    setShowFollowersModal(true);
    await loadFollowersList();
  }

  async function handleOpenFollowing() {
    setShowFollowingModal(true);
    await loadFollowingList();
  }

  function renderProfileListItem(item: FollowProfile) {
    const itemName = item.display_name || item.username;

    return (
      <Link
        key={item.id}
        href={`/u/${item.username}`}
        onClick={() => {
          setShowFollowersModal(false);
          setShowFollowingModal(false);
        }}
        className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        {item.avatar_url ? (
          <img
            src={item.avatar_url}
            alt={itemName}
            className="h-12 w-12 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {itemName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0">
          <p className="inline-flex max-w-full items-center gap-1 font-semibold text-black dark:text-white">
            <UserBadges userId={item.id} size="sm" max={1} />
            <span className="min-w-0 truncate">{itemName}</span>
          </p>
          <p className="break-all text-sm text-zinc-500">@{item.username}</p>
        </div>
      </Link>
    );
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function handleToggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  function handlePostClick() {
    router.push("/feed");
  }

  function getGiftPoster(mediaUrl: string | null | undefined) {
    if (!mediaUrl) return undefined;
    const fileName = mediaUrl.split("/").pop()?.replace(/\.[^.]+$/, "");
    return fileName ? `/gifts/images/${fileName}.png` : undefined;
  }

  function openShareGiftModal(item: GiftShowcaseItem) {
    const giftName = item.gift?.name || "um presente";
    const senderUsername = item.sender?.username
      ? `@${item.sender.username}`
      : "alguem especial";

    setGiftToShare(item);
    setShareGiftText(
      `Ganhei um presente na EntreUS! Recebi ${giftName} de ${senderUsername}.`,
    );
    setShareGiftMediaFailed(false);
    setMessage("");
  }

  async function handleShareGiftToFeed() {
    if (!loggedUserId || !profile || loggedUserId !== profile.id || !giftToShare) {
      return;
    }

    const item = giftToShare;
    const giftName = item.gift?.name || t("publicProfile.giftFallback");
    const senderUsername = item.sender?.username
      ? `@${item.sender.username}`
      : t("publicProfile.someoneSpecial");
    const receiverUsername = `@${profile.username}`;
    const mediaUrl = item.gift?.media_url || null;
    const isVideo = item.gift?.media_type === "video";
    const content = [
      shareGiftText.trim() ||
        t("publicProfile.defaultGiftPost", { gift: giftName, sender: senderUsername }),
      "",
      t("publicProfile.giftReceived"),
      t("publicProfile.giftLine", { gift: giftName }),
      t("publicProfile.fromLine", { sender: senderUsername }),
      t("publicProfile.toLine", { receiver: receiverUsername }),
    ].join("\n");

    setSharingGiftId(item.id);
    setMessage("");

    const { data, error } = await supabase
      .from("posts")
      .insert({
        user_id: loggedUserId,
        content,
        category: "gift_received",
        image_url: mediaUrl && !isVideo ? mediaUrl : null,
        video_url: mediaUrl && isVideo ? mediaUrl : null,
        visibility: "public",
        is_sensitive: false,
      })
      .select(
        "id, content, category, created_at, user_id, image_url, video_url, visibility, is_sensitive",
      )
      .single();

    setSharingGiftId(null);

    if (error) {
      setMessage(t("publicProfile.errors.shareGift"));
      return;
    }

    if (data) {
      setPosts((current) => [
        {
          ...(data as Post),
          profiles: {
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          },
          media: mediaUrl
            ? [
                {
                  id: `${data.id}-shared-gift-media`,
                  post_id: data.id,
                  user_id: loggedUserId,
                  media_url: mediaUrl,
                  media_type: isVideo ? "video" : "image",
                  position: 0,
                },
              ]
            : [],
        },
        ...current,
      ]);
    }

    setGiftToShare(null);
    setShareGiftText("");
    setActiveProfileTab("posts");
    setMessage(t("publicProfile.success.giftShared"));
  }

  function buildFeedItems(visiblePosts: Post[]): FeedItem[] {
    if (!profile) return [];

    const postMap = new Map<string, Post>();

    for (const post of visiblePosts) {
      postMap.set(post.id, post);
    }

    const ownPostItems: FeedItem[] = visiblePosts
      .filter((post) => post.user_id === profile.id)
      .map((post) => ({
        type: "post",
        id: `post-${post.id}`,
        created_at: post.created_at,
        post,
      }));

    const profileRepostItems = reposts
      .filter((repost) => repost.user_id === profile.id)
      .map((repost) => {
        const originalPost = postMap.get(repost.post_id);

        if (!originalPost) return null;

        return {
          type: "repost" as const,
          id: `repost-${repost.id}`,
          created_at: repost.created_at,
          post: originalPost,
          repost,
        };
      })
      .filter(
        (item): item is Extract<FeedItem, { type: "repost" }> => item !== null,
      );

    return [...ownPostItems, ...profileRepostItems].sort((a, b) => {
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }

  const publicPosts = useMemo(
    () => posts.filter((post) => isPublicCreatorProfilePost(post)),
    [posts],
  );

  const exclusivePosts = useMemo(
    () => posts.filter((post) => isExclusiveCreatorProfilePost(post)),
    [posts],
  );

  const publicFeedItems = useMemo<FeedItem[]>(
    () => buildFeedItems(publicPosts),
    [publicPosts, reposts, profile],
  );

  const exclusiveFeedItems = useMemo<FeedItem[]>(
    () => buildFeedItems(exclusivePosts),
    [exclusivePosts, reposts, profile],
  );

  const feedItems = activeProfileTab === "exclusive" ? exclusiveFeedItems : publicFeedItems;

  const exclusiveAccessState = getExclusiveAccessState({
    viewerId: loggedUserId,
    viewerProfile: {
      isMinor: loggedProfile?.is_minor,
      wants18Plus: loggedProfile?.wants_18_plus,
      ageVerificationStatus: loggedProfile?.age_verification_status,
    },
    isAuthor: loggedUserId === profile?.id,
  });

  const suggestedProfiles = useMemo(() => {
    const suggestions = new Map<string, ProfileSummary>();

    for (const item of publicFeedItems) {
      const itemProfile = item.post.profiles;

      if (!itemProfile?.username || itemProfile.username === profile?.username) {
        continue;
      }

      suggestions.set(itemProfile.username, itemProfile);
    }

    return Array.from(suggestions.values()).slice(0, 3);
  }, [publicFeedItems, profile?.username]);

  const profileTabs: { id: ProfileTab; label: string; count?: number }[] = [
    { id: "posts", label: t("publicProfile.tabs.posts"), count: publicFeedItems.length },
    { id: "exclusive", label: t("publicProfile.tabs.exclusive"), count: exclusiveFeedItems.length },
  ];
  const repostsCount = publicFeedItems.filter((item) => item.type === "repost").length;

  async function refreshPublicProfileActivity() {
    if (!profile) return;

    await loadPublicProfileActivity(
      profile,
      loggedUserId,
      loggedUserId === profile.id,
      isFollowing,
      loggedProfile?.show_sensitive_content || false,
      loggedProfile,
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 text-black dark:bg-black dark:text-white">
        <p>{t("publicProfile.loading")}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen overflow-x-hidden bg-zinc-50 text-black transition-colors dark:bg-black dark:text-white">
        <AppSidebar
          unreadNotificationsCount={unreadNotificationsCount}
          mounted={mounted}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onLogout={handleLogout}
        />

        <MobileNavigation
          email={email}
          displayName={
            loggedProfile?.display_name ||
            loggedProfile?.username ||
            t("navigation.myAccount")
          }
          avatarUrl={loggedProfile?.avatar_url || null}
          unreadNotificationsCount={unreadNotificationsCount}
          mounted={mounted}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onLogout={handleLogout}
          onPostClick={handlePostClick}
        />

        <section className="w-full overflow-x-hidden px-3 py-16 pb-24 sm:px-6 sm:py-20 lg:mx-auto lg:max-w-[1280px] lg:px-0 lg:py-8 lg:pl-[104px]">
          <BrandHeader
            subtitle={t("publicProfile.title")}
            description={t("publicProfile.description")}
            compact
          />

          <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-700 dark:text-zinc-300">
              {message || t("publicProfile.errors.notFound")}
            </p>

            <Link
              href="/feed"
              className="mt-5 inline-flex rounded-full border border-zinc-300 bg-white px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
            >
              {t("publicProfile.backToFeed")}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const displayName = profile.display_name || profile.username;
  const isOwnProfile = loggedUserId === profile.id;

  function renderFeedItem(item: FeedItem) {
    const post = item.post;

    const postComments = comments.filter(
      (comment) => comment.post_id === post.id,
    );
    const postLikes = likes.filter((like) => like.post_id === post.id);
    const postReposts = reposts.filter((repost) => repost.post_id === post.id);

    const userLiked = likes.some(
      (like) => like.post_id === post.id && like.user_id === loggedUserId,
    );

    const postSaved = bookmarks.some(
      (bookmark) =>
        bookmark.post_id === post.id && bookmark.user_id === loggedUserId,
    );

    const postReposted = reposts.some(
      (repost) => repost.post_id === post.id && repost.user_id === loggedUserId,
    );

    return (
      <PostCard
        key={item.id}
        post={post}
        currentUserId={loggedUserId}
        commentsCount={postComments.length}
        likesCount={postLikes.length}
        repostsCount={postReposts.length}
        liked={userLiked}
        saved={postSaved}
        reposted={postReposted}
        copied={copiedPostId === post.id}
        reported={reportedPostIds.includes(post.id)}
        reporting={reportingPostId === post.id}
        showSensitiveContent={loggedProfile?.show_sensitive_content || false}
        canViewAdultContent={canViewAdultContent({
          isMinor: loggedProfile?.is_minor,
          wants18Plus: loggedProfile?.wants_18_plus,
          ageVerificationStatus: loggedProfile?.age_verification_status,
        })}
        repostInfo={item.type === "repost" ? item.repost : null}
        footerLabel={
          item.type === "post"
            ? t("publicProfile.publishedAt", { date: new Date(post.created_at).toLocaleString(language) })
            : undefined
        }
        showMenu
        onLike={() => handleToggleLike(post.id)}
        onCommentClick={() => router.push(`/post/${post.id}`)}
        onRepost={() => handleToggleRepost(post.id)}
        onSave={() => handleToggleBookmark(post.id)}
        onShare={() => handleCopyPostLink(post.id)}
        onCopy={() => handleCopyPostLink(post.id)}
        onEdit={() => router.push(`/post/${post.id}`)}
        onDelete={() => router.push(`/post/${post.id}`)}
        onReport={() => handleReportPost(post.id, post.user_id)}
        onPaidPostUnlocked={refreshPublicProfileActivity}
        authorTier={post.user_id === profile?.id
          ? profileTier
          : resolveUserTier({
            vipStatus: post.profiles?.vip_status,
            vipExpiresAt: post.profiles?.vip_expires_at,
          })}
        authorProfileTheme={post.user_id === profile?.id ? profile?.profile_theme : post.profiles?.profile_theme}
      />
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-zinc-50 text-black transition-colors dark:bg-black dark:text-white">
      <AppSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
      />

      <MobileNavigation
        email={email}
        displayName={
          loggedProfile?.display_name ||
          loggedProfile?.username ||
          t("navigation.myAccount")
        }
        avatarUrl={loggedProfile?.avatar_url || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onPostClick={handlePostClick}
      />

      <GiftModal
        open={giftModalOpen}
        currentUserId={loggedUserId}
        recipient={profile ? {
          id: profile.id,
          name: profile.display_name || profile.username,
          username: profile.username,
          avatarUrl: profile.avatar_url,
        } : null}
        onClose={() => setGiftModalOpen(false)}
        onSent={() => profile && loadPublicReceivedGifts(profile.id)}
      />

      <TipModal
        open={tipModalOpen}
        currentUserId={loggedUserId}
        recipient={profile ? {
          id: profile.id,
          name: profile.display_name || profile.username,
          username: profile.username,
          avatarUrl: profile.avatar_url,
        } : null}
        onClose={() => setTipModalOpen(false)}
      />

      {giftToShare && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 px-4 py-6 text-white backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={t("publicProfile.closeSharing")}
            onClick={() => setGiftToShare(null)}
          />

          <div className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/10 bg-zinc-950 p-5 shadow-2xl shadow-black/50 ring-1 ring-white/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300">
                  {t("publicProfile.shareGift")}
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  {t("publicProfile.customizeThanks")}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setGiftToShare(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 transition hover:bg-white/10"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-start">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[1.75rem] border border-blue-300/20 bg-gradient-to-br from-blue-500/15 via-black to-zinc-950 p-3">
                {giftToShare.gift?.media_url &&
                giftToShare.gift.media_type === "video" &&
                !shareGiftMediaFailed ? (
                  <video
                    src={giftToShare.gift.media_url}
                    poster={getGiftPoster(giftToShare.gift.media_url)}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onError={() => setShareGiftMediaFailed(true)}
                    className="h-full w-full rounded-2xl object-contain"
                  />
                ) : giftToShare.gift?.media_url && !shareGiftMediaFailed ? (
                  <img
                    src={giftToShare.gift.media_url}
                    alt={giftToShare.gift.name}
                    onError={() => setShareGiftMediaFailed(true)}
                    className="h-full w-full rounded-2xl object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-2xl bg-blue-500/10 text-blue-100">
                    <Gift className="h-16 w-16 stroke-[1.5]" />
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <span className="inline-flex rounded-full bg-blue-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-blue-100 ring-1 ring-blue-300/20">
                  {t("publicProfile.giftReceived")}
                </span>
                <h3 className="mt-3 text-2xl font-black">
                  {giftToShare.gift?.name || t("publicProfile.giftFallback")}
                </h3>
                <p className="mt-2 text-sm text-zinc-400">
                  De{" "}
                  {giftToShare.sender?.username
                    ? `@${giftToShare.sender.username}`
                    : t("publicProfile.someoneSpecial")}{" "}
                  {t("publicProfile.toUser", { username: profile.username })}
                </p>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-black">
                {t("publicProfile.postText")}
              </span>
              <textarea
                value={shareGiftText}
                onChange={(event) => setShareGiftText(event.target.value)}
                rows={5}
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
              />
            </label>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setGiftToShare(null)}
                className="inline-flex items-center justify-center rounded-full border border-white/10 px-5 py-3 text-sm font-black text-zinc-200 transition hover:bg-white/10"
              >
                {t("common.cancel")}
              </button>

              <button
                type="button"
                onClick={handleShareGiftToFeed}
                disabled={sharingGiftId === giftToShare.id}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sharingGiftId === giftToShare.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Gift className="h-4 w-4" />
                )}
                {t("publicProfile.publishToFeed")}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="w-full overflow-x-hidden px-3 py-16 pb-24 sm:px-6 sm:py-20 lg:mx-auto lg:max-w-[1280px] lg:px-0 lg:py-8 lg:pl-[104px]">
        <BrandHeader
          subtitle={t("publicProfile.title")}
          description={`Acompanhe publicações, reposts e informações públicas de ${displayName}.`}
          compact
        />

        <div className="mx-auto grid w-full grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,40rem)_20rem]">
          <div className="min-w-0">
        <div className={`mb-6 overflow-hidden rounded-[2rem] border border-zinc-200/70 bg-white/95 shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10 ${getUserTierSurfaceClassName(profileTier, 'profile')} ${effectiveProfileTheme.cardClassName}`}>
          <button
            type="button"
            onClick={() => profile.banner_url && setSelectedAvatarUrl(profile.banner_url)}
            disabled={!profile.banner_url}
            className={`group relative flex h-44 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-100 via-zinc-200 to-zinc-100 text-zinc-500 transition hover:opacity-95 disabled:cursor-default dark:from-zinc-900 dark:via-zinc-800 dark:to-black dark:text-zinc-400 sm:h-60 ${effectiveProfileTheme.bannerClassName}`}
            title={profile.banner_url ? t("publicProfile.openCover") : t("publicProfile.cover")}
            aria-label={profile.banner_url ? t("publicProfile.openCover") : t("publicProfile.cover")}
          >
            {profile.banner_url ? (
              <img
                src={profile.banner_url}
                alt={t("publicProfile.coverOf", { name: displayName })}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="px-4 text-center">
                <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                  {t("publicProfile.noCover")}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {t("publicProfile.coverHelp")}
                </p>
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

            {profile.banner_url && (
              <span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-white transition group-hover:flex">
                <Maximize2 className="h-6 w-6" />
              </span>
            )}
          </button>

          <div className="relative px-5 pb-6 sm:px-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-end">
                <div className="-mt-14 shrink-0 sm:-mt-16">
                  <ProfileAvatarFrame
                    tier={profileTier}
                    themeKey={effectiveProfileTheme.key}
                    className="h-28 w-28 sm:h-36 sm:w-36"
                  >
                    {profile.avatar_url ? (
                      <button
                        type="button"
                        onClick={() => setSelectedAvatarUrl(profile.avatar_url)}
                        className="group relative h-full w-full overflow-hidden rounded-full border-4 border-white bg-zinc-100 shadow-xl ring-1 ring-black/10 transition hover:scale-[1.02] dark:border-zinc-950 dark:bg-zinc-800 dark:ring-white/10"
                        title={t("publicProfile.openAvatar")}
                        aria-label={t("publicProfile.openAvatar")}
                      >
                        <img
                          src={profile.avatar_url}
                          alt={displayName}
                          className="h-full w-full object-cover"
                        />

                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                          <Maximize2 className="h-6 w-6 text-white" />
                        </span>
                      </button>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full border-4 border-white bg-zinc-100 text-4xl font-black text-zinc-700 shadow-xl ring-1 ring-black/10 dark:border-zinc-950 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-white/10">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </ProfileAvatarFrame>
                </div>

                <div className="min-w-0 flex-1 pb-1">
                  <h2 className="flex max-w-full items-center gap-2 text-2xl font-black leading-tight tracking-tight text-black dark:text-white sm:text-4xl">
                    <UserTierBadge tier={profileTier} size="md" />
                    <UserBadges userId={profile.id} size="md" max={1} excludeTierBadges={profileTier !== 'standard'} />
                    <span className="min-w-0 truncate" title={displayName}>
                      {displayName}
                    </span>
                  </h2>

                  {profileTier !== 'standard' && (
                    <p className="mt-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                      {profileTier === 'elder' ? t("publicProfile.elderMember") : t("publicProfile.vipBenefits")}
                    </p>
                  )}

                  <p className="mt-1 break-all text-sm font-medium text-zinc-500 dark:text-zinc-400 sm:text-base">
                    @{profile.username}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isOwnProfile && (
                      <Link
                        href="/profile"
                        className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white/80 px-3 text-xs font-bold text-zinc-900 shadow-sm transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-white dark:hover:bg-zinc-900 sm:text-sm"
                      >
                        {t("publicProfile.myProfile")}
                      </Link>
                    )}

                    <Link
                      href="/feed"
                      className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-zinc-950 px-3 text-xs font-bold text-white shadow-sm transition hover:scale-[1.02] hover:bg-black dark:bg-white dark:text-black sm:text-sm"
                    >
                      {t("publicProfile.goToFeed")}
                    </Link>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                    <button
                      type="button"
                      onClick={handleOpenFollowers}
                      className="inline-flex items-baseline gap-1 rounded-full px-0.5 font-medium transition hover:text-zinc-950 dark:hover:text-white"
                    >
                      <span className="font-black text-zinc-950 dark:text-white">
                        {followersCount}
                      </span>
                      <span>{t("publicProfile.followers")}</span>
                    </button>

                    <span className="text-zinc-300 dark:text-zinc-700">
                      &middot;
                    </span>

                    <button
                      type="button"
                      onClick={handleOpenFollowing}
                      className="inline-flex items-baseline gap-1 rounded-full px-0.5 font-medium transition hover:text-zinc-950 dark:hover:text-white"
                    >
                      <span className="font-black text-zinc-950 dark:text-white">
                        {followingCount}
                      </span>
                      <span>{t("publicProfile.following")}</span>
                    </button>

                    <span className="text-zinc-300 dark:text-zinc-700">
                      &middot;
                    </span>

                    <span className="inline-flex items-baseline gap-1">
                      <span className="font-black text-zinc-950 dark:text-white">
                        {feedItems.length}
                      </span>
                      <span>{t("publicProfile.activities")}</span>
                    </span>

                    <span className="text-zinc-300 dark:text-zinc-700">
                      &middot;
                    </span>

                    <span className="inline-flex items-baseline gap-1">
                      <span className="font-black text-zinc-950 dark:text-white">
                        {repostsCount}
                      </span>
                      <span>{t("publicProfile.reposts")}</span>
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {isOwnProfile && (
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300">
                        {t("publicProfile.ownProfile")}
                      </span>
                    )}

                    {isFollowing && !isOwnProfile && (
                      <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300">
                        {t("publicProfile.followsProfile")}
                      </span>
                    )}

                    {isBlockedByMe && (
                      <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                        {t("publicProfile.blockedByYou")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!isOwnProfile && !hasBlockedMe && (
                <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={handleToggleFollow}
                    disabled={followLoading || isBlockedByMe}
                    title={
                      followLoading
                        ? t("common.loading")
                        : isFollowing
                          ? t("publicProfile.following")
                          : t("publicProfile.follow")
                    }
                    aria-label={
                      followLoading
                        ? t("common.loading")
                        : isFollowing
                          ? t("publicProfile.following")
                          : t("publicProfile.follow")
                    }
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-bold transition ${isFollowing
                        ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300 dark:hover:bg-green-950"
                        : "border-zinc-900 bg-zinc-900 text-white hover:opacity-90 dark:border-white dark:bg-white dark:text-black"
                      } ${followLoading || isBlockedByMe ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    {isFollowing ? (
                      <UserCheck className="h-5 w-5" />
                    ) : (
                      <UserPlus className="h-5 w-5" />
                    )}
                    <span className="hidden sm:inline">
                      {isFollowing ? t("publicProfile.following") : t("publicProfile.follow")}
                    </span>
                  </button>

                  <StartConversationButton
                    targetUserId={profile.id}
                    disabled={isOwnProfile || hasBlockedMe || isBlockedByMe}
                    iconOnly
                    className={`flex h-11 w-11 items-center justify-center rounded-full border font-medium transition ${isOwnProfile || hasBlockedMe || isBlockedByMe
                        ? "cursor-not-allowed border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600"
                        : "border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950"
                      }`}
                  />

                  <button
                    type="button"
                    onClick={() => setGiftModalOpen(true)}
                    disabled={isOwnProfile || hasBlockedMe || isBlockedByMe}
                    title={t("publicProfile.gift")}
                    aria-label={t("publicProfile.gift")}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-bold transition ${
                      isOwnProfile || hasBlockedMe || isBlockedByMe
                        ? "cursor-not-allowed border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600"
                        : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950"
                    }`}
                  >
                    <Gift className="h-5 w-5" />
                    <span className="hidden sm:inline">{t("publicProfile.gift")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTipModalOpen(true)}
                    disabled={isOwnProfile || hasBlockedMe || isBlockedByMe}
                    title={t("publicProfile.supportCreator")}
                    aria-label={t("publicProfile.supportCreator")}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-bold transition ${
                      isOwnProfile || hasBlockedMe || isBlockedByMe
                        ? "cursor-not-allowed border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600"
                        : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950"
                    }`}
                  >
                    <Coins className="h-5 w-5" />
                    <span className="hidden sm:inline">{t("publicProfile.supportCreator")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleBlock}
                    disabled={blockLoading}
                    title={
                      blockLoading
                        ? t("common.loading")
                        : isBlockedByMe
                          ? t("publicProfile.unblockUser")
                          : t("publicProfile.blockUser")
                    }
                    aria-label={
                      blockLoading
                        ? t("common.loading")
                        : isBlockedByMe
                          ? t("publicProfile.unblockUser")
                          : t("publicProfile.blockUser")
                    }
                    className={`flex h-11 w-11 items-center justify-center rounded-full border font-medium transition ${isBlockedByMe
                        ? "border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        : "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                      } ${blockLoading ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <UserX className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    onClick={handleReportUser}
                    disabled={reportingUser || reportedUser}
                    title={
                      reportingUser
                        ? t("common.sending")
                        : reportedUser
                          ? t("publicProfile.userReported")
                          : t("publicProfile.reportUser")
                    }
                    aria-label={
                      reportingUser
                        ? t("common.sending")
                        : reportedUser
                          ? t("publicProfile.userReported")
                          : t("publicProfile.reportUser")
                    }
                    className={`flex h-11 w-11 items-center justify-center rounded-full border font-medium transition ${reportedUser
                        ? "border-green-300 bg-green-50 text-green-600 dark:border-green-700 dark:bg-green-950 dark:text-green-400"
                        : "border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                      } ${reportingUser ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <Flag className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-zinc-200/70 pt-5 dark:border-zinc-800/70">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                {t("publicProfile.about")}
              </p>

              {hasBlockedMe ? (
                <p className="text-zinc-700 dark:text-zinc-300">
                  {t("publicProfile.blockedYou")}
                </p>
              ) : isBlockedByMe ? (
                <p className="text-zinc-700 dark:text-zinc-300">
                  {t("publicProfile.youBlocked")}
                </p>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-800 dark:text-zinc-200">
                    {profile.bio?.trim() || t("publicProfile.noBio")}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(profile.city || profile.state || profile.country) && (
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-zinc-100/80 px-3 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/70 dark:bg-zinc-900/80 dark:text-zinc-300 dark:ring-zinc-800/70">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {[profile.city, profile.state, profile.country]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </span>
                    )}

                    {profile.website_url && (
                      <a
                        href={
                          profile.website_url.startsWith("http")
                            ? profile.website_url
                            : `https://${profile.website_url}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-200/80 transition hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/60 dark:hover:bg-blue-950/50"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {profile.website_title || profile.website_url}
                        </span>
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>

            {message && (
              <p className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-400">
                {message}
              </p>
            )}
          </div>
        </div>

        {!hasBlockedMe && !isBlockedByMe && (
          <div className="mb-6">
            <UserBadgesPanel
              userId={profile.id}
              title={t("publicProfile.badges")}
              emptyMessage={t("publicProfile.noBadges")}
            />
          </div>
        )}

        {!hasBlockedMe && !isBlockedByMe && (
          <div className="mb-6">
            <GiftShowcase
              gifts={receivedGifts}
              canGift={!isOwnProfile}
              onGiftClick={() => setGiftModalOpen(true)}
              canShare={isOwnProfile}
              sharingGiftId={sharingGiftId}
              onShareGift={openShareGiftModal}
            />
          </div>
        )}

        {!hasBlockedMe && !isBlockedByMe && (
          <div className="overflow-hidden rounded-[2rem] border border-zinc-200/70 bg-white/95 shadow-sm ring-1 ring-black/5 dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
            <div className="grid grid-cols-2 border-b border-zinc-200/70 dark:border-zinc-800/70">
              {profileTabs.map((tab) => {
                const selected = activeProfileTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveProfileTab(tab.id)}
                    className={`relative flex min-h-12 items-center justify-center gap-1 px-2 text-sm font-bold transition ${
                      selected
                        ? "text-zinc-950 dark:text-white"
                        : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-950 dark:hover:text-white"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {typeof tab.count === "number" && (
                      <span className="text-xs font-semibold text-zinc-400">
                        {tab.count}
                      </span>
                    )}
                    {selected && (
                      <span className="absolute bottom-0 h-1 w-12 rounded-full bg-blue-600 dark:bg-blue-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {activeProfileTab === "posts" && (
              <div className="space-y-4 p-3 sm:p-4">
                {feedItems.length === 0 && (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    {t("publicProfile.noActivity")}
                  </div>
                )}

                {feedItems.map(renderFeedItem)}
              </div>
            )}
            {activeProfileTab === "exclusive" && (
              <div className="space-y-4 p-3 sm:p-4">
                {exclusiveAccessState === "signed_out" && (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                    <p className="font-bold text-zinc-950 dark:text-white">
                      {t("publicProfile.signInExclusive")}
                    </p>
                    <Link href="/login" className="mt-4 inline-flex rounded-full bg-zinc-950 px-5 py-2 text-sm font-bold text-white dark:bg-white dark:text-black">
                      {t("auth.login.submit")}
                    </Link>
                  </div>
                )}

                {exclusiveAccessState === "available" && exclusiveFeedItems.length === 0 && (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    {t("publicProfile.noExclusive")}
                  </div>
                )}

                {exclusiveAccessState === "available" && exclusiveFeedItems.map(renderFeedItem)}
              </div>
            )}
          </div>
        )}

        {false && !hasBlockedMe && !isBlockedByMe && (
          <div className="hidden">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-black dark:text-white">
                {t("publicProfile.activitiesOf", { name: displayName })}
              </h3>

              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {t("publicProfile.activityDescription")}
              </p>
            </div>

            <div className="space-y-4">
              {feedItems.length === 0 && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  {t("publicProfile.noActivity")}
                </div>
              )}

              {feedItems.map((item) => {
                const post = item.post;

                const postComments = comments.filter(
                  (comment) => comment.post_id === post.id,
                );
                const postLikes = likes.filter(
                  (like) => like.post_id === post.id,
                );
                const postReposts = reposts.filter(
                  (repost) => repost.post_id === post.id,
                );

                const userLiked = likes.some(
                  (like) =>
                    like.post_id === post.id && like.user_id === loggedUserId,
                );

                const postSaved = bookmarks.some(
                  (bookmark) =>
                    bookmark.post_id === post.id &&
                    bookmark.user_id === loggedUserId,
                );

                const postReposted = reposts.some(
                  (repost) =>
                    repost.post_id === post.id &&
                    repost.user_id === loggedUserId,
                );

                return (
                  <PostCard
                    key={item.id}
                    post={post}
                    currentUserId={loggedUserId}
                    commentsCount={postComments.length}
                    likesCount={postLikes.length}
                    repostsCount={postReposts.length}
                    liked={userLiked}
                    saved={postSaved}
                    reposted={postReposted}
                    copied={copiedPostId === post.id}
                    reported={reportedPostIds.includes(post.id)}
                    reporting={reportingPostId === post.id}
                    showSensitiveContent={
                      loggedProfile?.show_sensitive_content || false
                    }
                    canViewAdultContent={canViewAdultContent({
                      isMinor: loggedProfile?.is_minor,
                      wants18Plus: loggedProfile?.wants_18_plus,
                      ageVerificationStatus: loggedProfile?.age_verification_status,
                    })}
                    repostInfo={item.type === "repost" ? item.repost : null}
                    footerLabel={
                      item.type === "post"
                        ? t("publicProfile.publishedAt", { date: new Date(post.created_at).toLocaleString(language) })
                        : undefined
                    }
                    showMenu
                    onLike={() => handleToggleLike(post.id)}
                    onCommentClick={() => router.push(`/post/${post.id}`)}
                    onRepost={() => handleToggleRepost(post.id)}
                    onSave={() => handleToggleBookmark(post.id)}
                    onShare={() => handleCopyPostLink(post.id)}
                    onCopy={() => handleCopyPostLink(post.id)}
                    onEdit={() => router.push(`/post/${post.id}`)}
                    onDelete={() => router.push(`/post/${post.id}`)}
                    onReport={() => handleReportPost(post.id, post.user_id)}
                    onPaidPostUnlocked={refreshPublicProfileActivity}
                    authorTier={post.user_id === profile?.id
                      ? profileTier
                      : resolveUserTier({
                        vipStatus: post.profiles?.vip_status,
                        vipExpiresAt: post.profiles?.vip_expires_at,
                      })}
                    authorProfileTheme={post.user_id === profile?.id ? profile?.profile_theme : post.profiles?.profile_theme}
                  />
                );
              })}
            </div>
          </div>
        )}
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-8 space-y-4">
              <div className="rounded-[2rem] border border-zinc-200/70 bg-white/95 p-4 shadow-sm ring-1 ring-black/5 dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
                <label className="flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-3 text-sm text-zinc-500 ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800/70">
                  <Search className="h-4 w-4" />
                  <input
                    type="search"
                    placeholder={t("publicProfile.search")}
                    onFocus={() => router.push("/search")}
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-500"
                  />
                </label>
              </div>

              <div className="rounded-[2rem] border border-zinc-200/70 bg-white/95 p-4 shadow-sm ring-1 ring-black/5 dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
                <h3 className="text-base font-black text-zinc-950 dark:text-white">
                  {t("publicProfile.suggestions")}
                </h3>

                <div className="mt-4 space-y-3">
                  {suggestedProfiles.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {t("publicProfile.exploreProfiles")}
                    </p>
                  ) : (
                    suggestedProfiles.map((suggestedProfile) => {
                      const suggestedName =
                        suggestedProfile.display_name ||
                        suggestedProfile.username;

                      return (
                        <Link
                          key={suggestedProfile.username}
                          href={`/u/${suggestedProfile.username}`}
                          className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-zinc-50 dark:hover:bg-zinc-950"
                        >
                          {suggestedProfile.avatar_url ? (
                            <img
                              src={suggestedProfile.avatar_url}
                              alt={suggestedName}
                              className="h-10 w-10 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-zinc-800"
                            />
                          ) : (
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-sm font-black text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                              {suggestedName.charAt(0).toUpperCase()}
                            </span>
                          )}

                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-zinc-950 dark:text-white">
                              {suggestedName}
                            </span>
                            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                              @{suggestedProfile.username}
                            </span>
                          </span>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-[2rem] border border-zinc-200/70 bg-white/95 p-4 shadow-sm ring-1 ring-black/5 dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
                <h3 className="text-base font-black text-zinc-950 dark:text-white">
                  {t("publicProfile.wall")}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {t("publicProfile.wallDescription")}
                </p>
                <Link
                  href="/feed"
                  className="mt-4 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-black dark:bg-white dark:text-black"
                >
                  {t("publicProfile.goToFeed")}
                </Link>
              </div>

              <nav className="flex flex-wrap gap-x-3 gap-y-2 px-2 text-xs text-zinc-500 dark:text-zinc-500">
                <Link href="/terms" className="hover:text-zinc-900 dark:hover:text-white">
                  {t("settings.terms")}
                </Link>
                <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-white">
                  {t("settings.privacyPolicy")}
                </Link>
                <Link href="/cookies" className="hover:text-zinc-900 dark:hover:text-white">
                  Cookies
                </Link>
                <Link href="/accessibility" className="hover:text-zinc-900 dark:hover:text-white">
                {t("publicProfile.accessibility")}
                </Link>
                <Link href="/more" className="hover:text-zinc-900 dark:hover:text-white">
                  {t("publicProfile.more")}
                </Link>
                <span>{t("publicProfile.copyright")}</span>
              </nav>
            </div>
          </aside>
        </div>
      </section>

      {selectedAvatarUrl && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setSelectedAvatarUrl(null)}
            className="absolute inset-0 cursor-zoom-out"
            aria-label={t("publicProfile.closeAvatar")}
          />

          <div className="relative z-[90] w-full max-w-lg">
            <button
              type="button"
              onClick={() => setSelectedAvatarUrl(null)}
              className="absolute -right-2 -top-12 flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-xl transition hover:opacity-90 dark:bg-zinc-900 dark:text-white"
              aria-label={t("publicProfile.closePhoto")}
              title={t("common.close")}
            >
              <X className="h-5 w-5" />
            </button>

            <img
              src={selectedAvatarUrl}
              alt={displayName}
              className="max-h-[80vh] w-full rounded-3xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {showFollowersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-black dark:text-white">
                {t("publicProfile.followers")}
              </h3>

              <button
                type="button"
                onClick={() => setShowFollowersModal(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {t("common.close")}
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4">
              {loadingFollowers ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                {t("publicProfile.loadingFollowers")}
                </p>
              ) : followersList.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                {t("publicProfile.noFollowers")}
                </p>
              ) : (
                <div className="space-y-2">
                  {followersList.map(renderProfileListItem)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showFollowingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-black dark:text-white">
                {t("publicProfile.following")}
              </h3>

              <button
                type="button"
                onClick={() => setShowFollowingModal(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {t("common.close")}
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4">
              {loadingFollowing ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                {t("publicProfile.loadingUsers")}
                </p>
              ) : followingList.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                {t("publicProfile.noFollowing")}
                </p>
              ) : (
                <div className="space-y-2">
                  {followingList.map(renderProfileListItem)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
