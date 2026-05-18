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
import StartConversationButton from "../../components/StartConversationButton";
import GiftModal from "../../components/GiftModal";
import GiftShowcase, { type GiftShowcaseItem } from "../../components/GiftShowcase";
import { ExternalLink, Flag, Gift, MapPin, Maximize2, Search, UserCheck, UserPlus, UserX, X } from "lucide-react";

type VisibilityType = "public" | "followers" | "private";
type ProfileTab = "posts" | "replies" | "media";

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
  wants_18_plus?: boolean | null;
  age_verification_status?: string | null;
};

type ProfileSummary = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type PostMedia = {
  id: string;
  post_id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  position: number;
  created_at?: string;
};

type Post = {
  id: string;
  content: string | null;
  category: string | null;
  created_at: string;
  user_id: string;
  image_url: string | null;
  video_url: string | null;
  visibility: VisibilityType;
  is_sensitive: boolean | null;
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

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const username = typeof params.username === "string" ? params.username : "";

  const [mounted, setMounted] = useState(false);
  const [loggedUserId, setLoggedUserId] = useState("");
  const [email, setEmail] = useState("");
  const [loggedProfile, setLoggedProfile] = useState<Profile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
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
  const [receivedGifts, setReceivedGifts] = useState<GiftShowcaseItem[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function loadPage() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setLoggedUserId(user.id);
      setEmail(user.email || "");

      const { data: loggedProfileData } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, bio, avatar_url, banner_url, country, city, state, website_url, website_title, show_sensitive_content, wants_18_plus, age_verification_status",
        )
        .eq("id", user.id)
        .maybeSingle();

      const normalizedLoggedProfile = loggedProfileData
        ? {
            ...loggedProfileData,
            show_sensitive_content: Boolean(
              loggedProfileData.wants_18_plus &&
                loggedProfileData.age_verification_status === "approved",
            ),
          }
        : null;

      setLoggedProfile(normalizedLoggedProfile);

      if (!username) {
        setMessage("Usuário inválido.");
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, bio, avatar_url, banner_url, country, city, state, website_url, website_title, show_sensitive_content, wants_18_plus, age_verification_status",
        )
        .eq("username", username)
        .maybeSingle();

      if (profileError) {
        setMessage("Erro ao carregar perfil: " + profileError.message);
        setLoading(false);
        return;
      }

      if (!profileData) {
        setMessage("Perfil não encontrado.");
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const isOwn = user.id === profileData.id;

      let blockedByMe = false;
      let blockedMe = false;
      let currentFollowData: { id: string } | null = null;

      if (!isOwn) {
        const { data: blockedByMeData, error: blockedByMeError } =
          await supabase
            .from("blocks")
            .select("id")
            .eq("blocker_id", user.id)
            .eq("blocked_id", profileData.id)
            .maybeSingle();

        if (blockedByMeError) {
          setMessage("Erro ao verificar bloqueio: " + blockedByMeError.message);
          setLoading(false);
          return;
        }

        const { data: hasBlockedMeData, error: hasBlockedMeError } =
          await supabase
            .from("blocks")
            .select("id")
            .eq("blocker_id", profileData.id)
            .eq("blocked_id", user.id)
            .maybeSingle();

        if (hasBlockedMeError) {
          setMessage(
            "Erro ao verificar bloqueio: " + hasBlockedMeError.message,
          );
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
            .eq("follower_id", user.id)
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
            user.id,
            isOwn,
            !!currentFollowData,
            normalizedLoggedProfile?.show_sensitive_content || false,
          ),
          loadCounts(profileData.id),
          loadLikes(),
          loadComments(),
          loadBookmarks(user.id),
          loadAllReposts(profileData),
          loadUnreadNotificationsCount(user.id),
          loadPublicReceivedGifts(profileData.id),
        ]);
      } else {
        setPosts([]);
        setFollowersCount(0);
        setFollowingCount(0);
        setIsFollowing(false);
        setReceivedGifts([]);
      }

      await loadUnreadNotificationsCount(user.id);

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
      setMessage("Erro ao carregar notificações: " + error.message);
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
      setMessage("Erro ao carregar seguidores: " + followersError.message);
      return;
    }

    setFollowersCount(followersData?.length || 0);

    const { data: followingData, error: followingError } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", profileId);

    if (followingError) {
      setMessage("Erro ao carregar seguindo: " + followingError.message);
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
      setMessage("Erro ao carregar curtidas: " + error.message);
      return;
    }

    setLikes(data || []);
  }

  async function loadComments() {
    const { data, error } = await supabase
      .from("comments")
      .select("id, post_id, user_id");

    if (error) {
      setMessage("Erro ao carregar comentários: " + error.message);
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
      setMessage("Erro ao carregar salvos: " + error.message);
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
      setMessage("Erro ao carregar reposts: " + error.message);
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
  ) {
    const { data: repostsData, error: repostsError } = await supabase
      .from("reposts")
      .select("id, post_id, user_id, created_at")
      .eq("user_id", profileData.id)
      .order("created_at", { ascending: false });

    if (repostsError) {
      setMessage("Erro ao carregar reposts do perfil: " + repostsError.message);
      return;
    }

    const repostPostIds = (repostsData || []).map((repost) => repost.post_id);

    const { data: ownPostsData, error: ownPostsError } = await supabase
      .from("posts")
      .select(
        `
        id,
        content,
        category,
        created_at,
        user_id,
        image_url,
        video_url,
        visibility,
        is_sensitive,
        profiles (
          username,
          display_name,
          avatar_url
        )
      `,
      )
      .eq("user_id", profileData.id)
      .order("created_at", { ascending: false });

    if (ownPostsError) {
      setMessage("Erro ao carregar publicações: " + ownPostsError.message);
      return;
    }

    const ownPosts = ((ownPostsData || []) as any[])
      .map((post) => ({
        ...post,
        visibility: (post.visibility || "public") as VisibilityType,
        is_sensitive: post.is_sensitive || false,
        profiles: Array.isArray(post.profiles)
          ? post.profiles[0] || null
          : post.profiles,
      }))
      .filter((post: Post) =>
        canSeePost(post, currentUserId, isOwn, currentIsFollowing),
      );

    let repostedPosts: Post[] = [];

    if (repostPostIds.length > 0) {
      const { data: repostedPostsData, error: repostedPostsError } =
        await supabase
          .from("posts")
          .select(
            `
          id,
          content,
          category,
          created_at,
          user_id,
          image_url,
          video_url,
          visibility,
          is_sensitive,
          profiles (
            username,
            display_name,
            avatar_url
          )
        `,
          )
          .in("id", repostPostIds);

      if (repostedPostsError) {
        setMessage(
          "Erro ao carregar posts repostados: " + repostedPostsError.message,
        );
        return;
      }

      repostedPosts = ((repostedPostsData || []) as any[])
        .map((post) => ({
          ...post,
          visibility: (post.visibility || "public") as VisibilityType,
          is_sensitive: post.is_sensitive || false,
          profiles: Array.isArray(post.profiles)
            ? post.profiles[0] || null
            : post.profiles,
        }))
        .filter((post: Post) =>
          canSeePost(
            post,
            currentUserId,
            post.user_id === currentUserId,
            currentIsFollowing,
          ),
        )
        .filter((post: Post) => canSeePost(post, currentUserId, false, currentIsFollowing));
    }

    const allPostsMap = new Map<string, Post>();

    for (const post of [...ownPosts, ...repostedPosts]) {
      allPostsMap.set(post.id, post);
    }

    const allPosts = Array.from(allPostsMap.values());
    const allPostIds = allPosts.map((post) => post.id);

    let mediaByPost: Record<string, PostMedia[]> = {};

    if (allPostIds.length > 0) {
      const { data: mediaData, error: mediaError } = await supabase
        .from("post_media")
        .select(
          "id, post_id, user_id, media_url, media_type, position, created_at",
        )
        .in("post_id", allPostIds)
        .order("position", { ascending: true });

      if (mediaError) {
        console.error(
          "Erro ao carregar mídias do perfil público:",
          mediaError.message,
        );
      }

      mediaByPost = ((mediaData || []) as PostMedia[]).reduce(
        (acc, mediaItem) => {
          if (!acc[mediaItem.post_id]) acc[mediaItem.post_id] = [];
          acc[mediaItem.post_id].push(mediaItem);
          return acc;
        },
        {} as Record<string, PostMedia[]>,
      );
    }

    const normalizedPosts = allPosts.map((post) => ({
      ...post,
      media: mediaByPost[post.id] || [],
    }));

    setPosts(normalizedPosts);

    const profileReposts: Repost[] = (repostsData || []).map((repost) => ({
      ...repost,
      profiles: {
        username: profileData.username,
        display_name: profileData.display_name,
        avatar_url: profileData.avatar_url,
      },
    }));

    setReposts((current) => {
      const otherReposts = current.filter(
        (repost) => repost.user_id !== profileData.id,
      );
      return [...otherReposts, ...profileReposts];
    });
  }

  function canSeePost(
    post: Post,
    currentUserId: string,
    isOwn: boolean,
    currentIsFollowing: boolean,
  ) {
    if (post.user_id === currentUserId) return true;
    if (isOwn) return true;
    if (post.visibility === "public") return true;
    if (post.visibility === "followers") return currentIsFollowing;
    return false;
  }

  function isSensitivePost(post: Post) {
    return (
      post.is_sensitive ||
      post.category === "adulto" ||
      post.category === "sensual" ||
      post.category === "18plus"
    );
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
      setMessage("Não é possível seguir enquanto houver bloqueio entre vocês.");
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
      setMessage("Erro ao verificar seguimento: " + checkError.message);
      setFollowLoading(false);
      return;
    }

    if (existingFollow) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("id", existingFollow.id);

      if (error) {
        setMessage("Erro ao deixar de seguir: " + error.message);
        setFollowLoading(false);
        return;
      }
    } else {
      const { error } = await supabase.from("follows").insert({
        follower_id: loggedUserId,
        following_id: profile.id,
      });

      if (error) {
        setMessage("Erro ao seguir: " + error.message);
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
        setMessage("Erro ao desbloquear usuário: " + error.message);
        setBlockLoading(false);
        return;
      }

      setMessage("Usuário desbloqueado com sucesso.");
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
        setMessage("Erro ao bloquear usuário: " + error.message);
        setBlockLoading(false);
        return;
      }

      setMessage("Usuário bloqueado com sucesso.");
    }

    await refreshProfileState(profile.id, loggedUserId);
    setBlockLoading(false);
  }

  async function handleReportUser() {
    if (!profile || !loggedUserId) return;
    if (loggedUserId === profile.id) {
      setMessage("Você não pode denunciar seu próprio perfil.");
      return;
    }

    const reason = window.prompt(
      "Informe o motivo da denúncia.\nEx.: assédio, perfil falso, conteúdo ofensivo, spam",
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
      setMessage("Erro ao denunciar usuário: " + error.message);
      setReportingUser(false);
      return;
    }

    setReportedUser(true);
    setMessage("Usuário denunciado com sucesso.");
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
        setMessage("Erro ao remover dos salvos: " + error.message);
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
      setMessage("Erro ao salvar post: " + error.message);
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
      setMessage("Você não precisa repostar sua própria publicação.");
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
        setMessage("Erro ao remover repost: " + error.message);
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
      setMessage("Erro ao repostar: " + error.message);
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
        setMessage("Erro ao remover curtida: " + error.message);
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
      setMessage("Erro ao curtir: " + error.message);
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
      setMessage("Não foi possível copiar o link do post.");
    }
  }

  async function handleReportPost(postId: string, postOwnerId: string) {
    if (!loggedUserId) return;

    if (postOwnerId === loggedUserId) {
      setMessage("Você não pode denunciar sua própria publicação.");
      return;
    }

    const reason = window.prompt(
      "Informe o motivo da denúncia.\nEx.: spam, nudez indevida, assédio, conteúdo ofensivo",
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
      setMessage("Erro ao denunciar publicação: " + error.message);
      setReportingPostId(null);
      return;
    }

    setReportedPostIds((prev) => [...prev, postId]);
    setMessage("Publicação denunciada com sucesso.");
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
      setMessage("Erro ao carregar seguidores: " + followsError.message);
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
      setMessage("Erro ao carregar seguidores: " + profilesError.message);
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
      setMessage("Erro ao carregar seguindo: " + followsError.message);
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
      setMessage("Erro ao carregar seguindo: " + profilesError.message);
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

  const feedItems = useMemo<FeedItem[]>(() => {
    if (!profile) return [];

    const postMap = new Map<string, Post>();

    for (const post of posts) {
      postMap.set(post.id, post);
    }

    const ownPostItems: FeedItem[] = posts
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
  }, [posts, reposts, profile]);

  const mediaItems = useMemo(() => {
    return feedItems.filter((item) => {
      const post = item.post;

      return (
        (post.media && post.media.length > 0) ||
        Boolean(post.image_url) ||
        Boolean(post.video_url)
      );
    });
  }, [feedItems]);

  const suggestedProfiles = useMemo(() => {
    const suggestions = new Map<string, ProfileSummary>();

    for (const item of feedItems) {
      const itemProfile = item.post.profiles;

      if (!itemProfile?.username || itemProfile.username === profile?.username) {
        continue;
      }

      suggestions.set(itemProfile.username, itemProfile);
    }

    return Array.from(suggestions.values()).slice(0, 3);
  }, [feedItems, profile?.username]);

  const repostsCount = feedItems.filter((item) => item.type === "repost").length;
  const profileTabs: { id: ProfileTab; label: string; count?: number }[] = [
    { id: "posts", label: "Posts", count: feedItems.length },
    { id: "replies", label: "Respostas" },
    { id: "media", label: "Mídia", count: mediaItems.length },
  ];

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 text-black dark:bg-black dark:text-white">
        <p>Carregando perfil...</p>
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
            "Minha conta"
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
            subtitle="Perfil público"
            description="Veja informações públicas, publicações e atividades de usuários do EntreUS."
            compact
          />

          <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-700 dark:text-zinc-300">
              {message || "Perfil não encontrado."}
            </p>

            <Link
              href="/feed"
              className="mt-5 inline-flex rounded-full border border-zinc-300 bg-white px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
            >
              Voltar ao feed
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
        repostInfo={item.type === "repost" ? item.repost : null}
        footerLabel={
          item.type === "post"
            ? `Publicado em ${new Date(post.created_at).toLocaleString("pt-BR")}`
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
          "Minha conta"
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

      <section className="w-full overflow-x-hidden px-3 py-16 pb-24 sm:px-6 sm:py-20 lg:mx-auto lg:max-w-[1280px] lg:px-0 lg:py-8 lg:pl-[104px]">
        <BrandHeader
          subtitle="Perfil público"
          description={`Acompanhe publicações, reposts e informações públicas de ${displayName}.`}
          compact
        />

        <div className="mx-auto grid w-full grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,40rem)_20rem]">
          <div className="min-w-0">
        <div className="mb-6 overflow-hidden rounded-[2rem] border border-zinc-200/70 bg-white/95 shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
          <button
            type="button"
            onClick={() => profile.banner_url && setSelectedAvatarUrl(profile.banner_url)}
            disabled={!profile.banner_url}
            className="group relative flex h-44 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-100 via-zinc-200 to-zinc-100 text-zinc-500 transition hover:opacity-95 disabled:cursor-default dark:from-zinc-900 dark:via-zinc-800 dark:to-black dark:text-zinc-400 sm:h-60"
            title={profile.banner_url ? "Abrir capa do perfil" : "Capa do perfil"}
            aria-label={profile.banner_url ? "Abrir capa do perfil" : "Capa do perfil"}
          >
            {profile.banner_url ? (
              <img
                src={profile.banner_url}
                alt={`Capa de ${displayName}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="px-4 text-center">
                <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                  Este perfil ainda não adicionou uma capa.
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  A capa aparecerá aqui quando for adicionada.
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
                  {profile.avatar_url ? (
                    <button
                      type="button"
                      onClick={() => setSelectedAvatarUrl(profile.avatar_url)}
                      className="group relative h-28 w-28 overflow-hidden rounded-full border-4 border-white bg-zinc-100 shadow-xl ring-1 ring-black/10 transition hover:scale-[1.02] dark:border-zinc-950 dark:bg-zinc-800 dark:ring-white/10 sm:h-36 sm:w-36"
                      title="Abrir foto de perfil"
                      aria-label="Abrir foto de perfil"
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
                    <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white bg-zinc-100 text-4xl font-black text-zinc-700 shadow-xl ring-1 ring-black/10 dark:border-zinc-950 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-white/10 sm:h-36 sm:w-36">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 pb-1">
                  <h2 className="flex max-w-full items-center gap-2 text-2xl font-black leading-tight tracking-tight text-black dark:text-white sm:text-4xl">
                    <UserBadges userId={profile.id} size="md" max={1} />
                    <span className="min-w-0 truncate" title={displayName}>
                      {displayName}
                    </span>
                  </h2>

                  <p className="mt-1 break-all text-sm font-medium text-zinc-500 dark:text-zinc-400 sm:text-base">
                    @{profile.username}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isOwnProfile && (
                      <Link
                        href="/profile"
                        className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white/80 px-3 text-xs font-bold text-zinc-900 shadow-sm transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-white dark:hover:bg-zinc-900 sm:text-sm"
                      >
                        Meu perfil
                      </Link>
                    )}

                    <Link
                      href="/feed"
                      className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-zinc-950 px-3 text-xs font-bold text-white shadow-sm transition hover:scale-[1.02] hover:bg-black dark:bg-white dark:text-black sm:text-sm"
                    >
                      Ir ao feed
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
                      <span>Seguidores</span>
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
                      <span>Seguindo</span>
                    </button>

                    <span className="text-zinc-300 dark:text-zinc-700">
                      &middot;
                    </span>

                    <span className="inline-flex items-baseline gap-1">
                      <span className="font-black text-zinc-950 dark:text-white">
                        {feedItems.length}
                      </span>
                      <span>Atividades</span>
                    </span>

                    <span className="text-zinc-300 dark:text-zinc-700">
                      &middot;
                    </span>

                    <span className="inline-flex items-baseline gap-1">
                      <span className="font-black text-zinc-950 dark:text-white">
                        {repostsCount}
                      </span>
                      <span>Reposts</span>
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {isOwnProfile && (
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300">
                        Este é o seu perfil
                      </span>
                    )}

                    {isFollowing && !isOwnProfile && (
                      <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300">
                        Você segue este perfil
                      </span>
                    )}

                    {isBlockedByMe && (
                      <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                        Perfil bloqueado por você
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
                        ? "Carregando..."
                        : isFollowing
                          ? "Seguindo"
                          : "Seguir"
                    }
                    aria-label={
                      followLoading
                        ? "Carregando..."
                        : isFollowing
                          ? "Seguindo"
                          : "Seguir"
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
                      {isFollowing ? "Seguindo" : "Seguir"}
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
                    title="Presentear"
                    aria-label="Presentear"
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-bold transition ${
                      isOwnProfile || hasBlockedMe || isBlockedByMe
                        ? "cursor-not-allowed border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600"
                        : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950"
                    }`}
                  >
                    <Gift className="h-5 w-5" />
                    <span className="hidden sm:inline">Presentear</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleBlock}
                    disabled={blockLoading}
                    title={
                      blockLoading
                        ? "Carregando..."
                        : isBlockedByMe
                          ? "Desbloquear usuário"
                          : "Bloquear usuário"
                    }
                    aria-label={
                      blockLoading
                        ? "Carregando..."
                        : isBlockedByMe
                          ? "Desbloquear usuário"
                          : "Bloquear usuário"
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
                        ? "Enviando..."
                        : reportedUser
                          ? "Usuário denunciado"
                          : "Denunciar usuário"
                    }
                    aria-label={
                      reportingUser
                        ? "Enviando..."
                        : reportedUser
                          ? "Usuário denunciado"
                          : "Denunciar usuário"
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
                Sobre
              </p>

              {hasBlockedMe ? (
                <p className="text-zinc-700 dark:text-zinc-300">
                  Você não pode visualizar este perfil porque este usuário te
                  bloqueou.
                </p>
              ) : isBlockedByMe ? (
                <p className="text-zinc-700 dark:text-zinc-300">
                  Você bloqueou este usuário. Desbloqueie para voltar a ver o
                  conteúdo dele.
                </p>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-800 dark:text-zinc-200">
                    {profile.bio?.trim() ||
                      "Este usuário ainda não adicionou uma bio."}
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
              title="Selos conquistados"
              emptyMessage="Este usuário ainda não possui selos conquistados."
            />
          </div>
        )}

        {!hasBlockedMe && !isBlockedByMe && (
          <div className="mb-6">
            <GiftShowcase
              gifts={receivedGifts}
              canGift={!isOwnProfile}
              onGiftClick={() => setGiftModalOpen(true)}
            />
          </div>
        )}

        {!hasBlockedMe && !isBlockedByMe && (
          <div className="overflow-hidden rounded-[2rem] border border-zinc-200/70 bg-white/95 shadow-sm ring-1 ring-black/5 dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
            <div className="grid grid-cols-3 border-b border-zinc-200/70 dark:border-zinc-800/70">
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
                    Nenhuma atividade visível ainda.
                  </div>
                )}

                {feedItems.map(renderFeedItem)}
              </div>
            )}

            {activeProfileTab === "replies" && (
              <div className="p-6 text-center">
                <p className="text-base font-bold text-zinc-900 dark:text-white">
                  Respostas em breve
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  As respostas deste perfil aparecerão aqui quando essa
                  visualização estiver disponível.
                </p>
              </div>
            )}

            {activeProfileTab === "media" && (
              <div className="p-3 sm:p-4">
                {mediaItems.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    Nenhuma mídia visível ainda.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {mediaItems.map((item) => {
                      const post = item.post;
                      const media = post.media?.[0];
                      const mediaUrl =
                        media?.media_url || post.image_url || post.video_url;
                      const isVideo =
                        media?.media_type === "video" || Boolean(post.video_url);

                      if (!mediaUrl) return null;

                      return (
                        <button
                          key={`media-${item.id}`}
                          type="button"
                          onClick={() => router.push(`/post/${post.id}`)}
                          className="group relative aspect-square overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/70 transition hover:scale-[1.01] dark:bg-zinc-900 dark:ring-zinc-800/70"
                        >
                          {isVideo ? (
                            <video
                              src={mediaUrl}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={mediaUrl}
                              alt="Mídia do post"
                              className="h-full w-full object-cover"
                            />
                          )}

                          <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/20" />
                          {isVideo && (
                            <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-black uppercase text-white">
                              Vídeo
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {false && !hasBlockedMe && !isBlockedByMe && (
          <div className="hidden">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-black dark:text-white">
                Atividades de {displayName}
              </h3>

              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Publicações e reposts deste perfil
              </p>
            </div>

            <div className="space-y-4">
              {feedItems.length === 0 && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Nenhuma atividade visível ainda.
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
                    repostInfo={item.type === "repost" ? item.repost : null}
                    footerLabel={
                      item.type === "post"
                        ? `Publicado em ${new Date(post.created_at).toLocaleString("pt-BR")}`
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
                    placeholder="Buscar no EntreUS"
                    onFocus={() => router.push("/search")}
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-500"
                  />
                </label>
              </div>

              <div className="rounded-[2rem] border border-zinc-200/70 bg-white/95 p-4 shadow-sm ring-1 ring-black/5 dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
                <h3 className="text-base font-black text-zinc-950 dark:text-white">
                  Talvez você curta
                </h3>

                <div className="mt-4 space-y-3">
                  {suggestedProfiles.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Explore o feed para descobrir mais perfis do EntreUS.
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
                  Mural EntreUS
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  Conecte-se com pessoas reais, acompanhe publicações e
                  descubra conversas que combinam com o seu momento.
                </p>
                <Link
                  href="/feed"
                  className="mt-4 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-black dark:bg-white dark:text-black"
                >
                  Ir ao feed
                </Link>
              </div>

              <nav className="flex flex-wrap gap-x-3 gap-y-2 px-2 text-xs text-zinc-500 dark:text-zinc-500">
                <Link href="/terms" className="hover:text-zinc-900 dark:hover:text-white">
                  Termos de Uso
                </Link>
                <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-white">
                  Política de Privacidade
                </Link>
                <Link href="/cookies" className="hover:text-zinc-900 dark:hover:text-white">
                  Cookies
                </Link>
                <Link href="/accessibility" className="hover:text-zinc-900 dark:hover:text-white">
                  Acessibilidade
                </Link>
                <Link href="/more" className="hover:text-zinc-900 dark:hover:text-white">
                  Mais
                </Link>
                <span>© 2026 EntreUS</span>
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
            aria-label="Fechar foto de perfil"
          />

          <div className="relative z-[90] w-full max-w-lg">
            <button
              type="button"
              onClick={() => setSelectedAvatarUrl(null)}
              className="absolute -right-2 -top-12 flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-xl transition hover:opacity-90 dark:bg-zinc-900 dark:text-white"
              aria-label="Fechar foto"
              title="Fechar"
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
                Seguidores
              </h3>

              <button
                type="button"
                onClick={() => setShowFollowersModal(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Fechar
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4">
              {loadingFollowers ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                  Carregando seguidores...
                </p>
              ) : followersList.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                  Nenhum seguidor ainda.
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
                Seguindo
              </h3>

              <button
                type="button"
                onClick={() => setShowFollowingModal(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Fechar
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4">
              {loadingFollowing ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                  Carregando usuários...
                </p>
              ) : followingList.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                  Este usuário ainda não segue ninguém.
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
