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
import { Flag, Maximize2, UserCheck, UserPlus, UserX, X } from "lucide-react";

type VisibilityType = "public" | "followers" | "private";

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  show_sensitive_content?: boolean | null;
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
          "id, username, display_name, bio, avatar_url, show_sensitive_content",
        )
        .eq("id", user.id)
        .maybeSingle();

      setLoggedProfile(loggedProfileData || null);

      if (!username) {
        setMessage("Usuário inválido.");
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, bio, avatar_url, show_sensitive_content",
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
            loggedProfileData?.show_sensitive_content || false,
          ),
          loadCounts(profileData.id),
          loadLikes(),
          loadComments(),
          loadBookmarks(user.id),
          loadAllReposts(profileData),
          loadUnreadNotificationsCount(user.id),
        ]);
      } else {
        setPosts([]);
        setFollowersCount(0);
        setFollowingCount(0);
        setIsFollowing(false);
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
        .filter((post: Post) => {
          if (post.user_id === currentUserId) return true;
          if (allowSensitiveContent) return true;

          return !isSensitivePost(post);
        });
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
      post.category === "sensual"
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

        <section className="w-full max-w-4xl overflow-x-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[calc(270px+((100vw-270px-56rem)/2))] lg:py-8">
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

      <section className="w-full max-w-4xl overflow-x-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[calc(270px+((100vw-270px-56rem)/2))] lg:py-8">
        <BrandHeader
          subtitle="Perfil público"
          description={`Acompanhe publicações, reposts e informações públicas de ${displayName}.`}
          compact
          rightContent={
            <div className="flex flex-wrap gap-2">
              {isOwnProfile && (
                <Link
                  href="/profile"
                  className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
                >
                  Meu perfil
                </Link>
              )}

              <Link
                href="/feed"
                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
              >
                Voltar ao feed
              </Link>
            </div>
          }
        />

        <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col items-start justify-between gap-5 xl:flex-row">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              {profile.avatar_url ? (
                <button
                  type="button"
                  onClick={() => setSelectedAvatarUrl(profile.avatar_url)}
                  className="group relative h-28 w-28 shrink-0 overflow-hidden rounded-full border border-zinc-300 bg-zinc-100 dark:border-zinc-700"
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
                <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-4xl font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1 pt-1">
                <h2 className="flex max-w-full items-center gap-2 text-2xl font-bold leading-tight text-black dark:text-white sm:text-3xl">
                  <UserBadges userId={profile.id} size="md" max={1} />
                  <span className="min-w-0 truncate" title={displayName}>
                    {displayName}
                  </span>
                </h2>

                <p className="mt-1 break-all text-zinc-500 dark:text-zinc-400">
                  @{profile.username}
                </p>
              </div>
            </div>

            {!isOwnProfile && !hasBlockedMe && (
              <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
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
                  className={`flex h-11 w-11 items-center justify-center rounded-full border font-medium transition ${
                    isFollowing
                      ? "border-green-300 bg-green-50 text-green-600 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400 dark:hover:bg-green-950"
                      : "border-zinc-900 bg-zinc-900 text-white hover:opacity-90 dark:border-white dark:bg-white dark:text-black"
                  } ${followLoading || isBlockedByMe ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  {isFollowing ? (
                    <UserCheck className="h-5 w-5" />
                  ) : (
                    <UserPlus className="h-5 w-5" />
                  )}
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
                  className={`flex h-11 w-11 items-center justify-center rounded-full border font-medium transition ${
                    isBlockedByMe
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
                  className={`flex h-11 w-11 items-center justify-center rounded-full border font-medium transition ${
                    reportedUser
                      ? "border-green-300 bg-green-50 text-green-600 dark:border-green-700 dark:bg-green-950 dark:text-green-400"
                      : "border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                  } ${reportingUser ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <Flag className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-6 text-sm text-zinc-700 dark:text-zinc-300">
            <button
              type="button"
              onClick={handleOpenFollowers}
              className="text-left transition hover:opacity-80"
            >
              <span className="font-semibold text-black dark:text-white">
                {followersCount}
              </span>{" "}
              seguidores
            </button>

            <button
              type="button"
              onClick={handleOpenFollowing}
              className="text-left transition hover:opacity-80"
            >
              <span className="font-semibold text-black dark:text-white">
                {followingCount}
              </span>{" "}
              seguindo
            </button>

            <p>
              <span className="font-semibold text-black dark:text-white">
                {feedItems.length}
              </span>{" "}
              atividades
            </p>

            <p>
              <span className="font-semibold text-black dark:text-white">
                {feedItems.filter((item) => item.type === "repost").length}
              </span>{" "}
              reposts
            </p>
          </div>

          <div className="mt-4">
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
              <p className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                {profile.bio?.trim() ||
                  "Este usuário ainda não adicionou uma bio."}
              </p>
            )}
          </div>

          {message && (
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              {message}
            </p>
          )}
        </div>

        {!hasBlockedMe && !isBlockedByMe && (
          <>
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
          </>
        )}
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
