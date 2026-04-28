"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Globe,
  ImagePlus,
  Lock,
  SendHorizontal,
  Tag,
  Users,
  Video,
  X,
} from "lucide-react";

type VisibilityType = "public" | "followers" | "private";

type ComposerSubmitData = {
  content: string;
  category: string;
  visibility: VisibilityType;
  imageFile: File | null;
  videoFile: File | null;
};

type PostComposerProps = {
  userName?: string;
  userAvatarUrl?: string | null;
  submitting?: boolean;
  onSubmit: (data: ComposerSubmitData) => Promise<void> | void;
};

const CATEGORY_OPTIONS = [
  { value: "cotidiano", label: "Cotidiano" },
  { value: "viagens", label: "Viagens" },
  { value: "lugares", label: "Lugares" },
  { value: "comida", label: "Comida" },
  { value: "pensamentos", label: "Pensamentos" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "sensual", label: "Sensual" },
  { value: "adulto", label: "Adulto" },
];

const VISIBILITY_OPTIONS: {
  value: VisibilityType;
  label: string;
}[] = [
  { value: "public", label: "Público" },
  { value: "followers", label: "Seguidores" },
  { value: "private", label: "Privado" },
];

function getVisibilityConfig(value: VisibilityType) {
  if (value === "private") {
    return {
      label: "Privado",
      icon: Lock,
    };
  }

  if (value === "followers") {
    return {
      label: "Seguidores",
      icon: Users,
    };
  }

  return {
    label: "Público",
    icon: Globe,
  };
}

function getInitials(name?: string) {
  if (!name) return "U";

  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function IconActionButton({
  tooltip,
  active = false,
  onClick,
  children,
}: {
  tooltip: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      className={[
        "group relative flex h-11 w-11 items-center justify-center rounded-full border transition-all",
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-black"
          : "border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
      ].join(" ")}
    >
      {children}

      <span className="pointer-events-none absolute -top-11 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 dark:bg-white dark:text-black">
        {tooltip}
      </span>
    </button>
  );
}

function SmallChip({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
      {children}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function PostComposer({
  userName,
  userAvatarUrl,
  submitting = false,
  onSubmit,
}: PostComposerProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const [content, setContent] = useState("");
  const [category, setCategory] = useState("cotidiano");
  const [visibility, setVisibility] = useState<VisibilityType>("public");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<"category" | "visibility" | null>(
    null
  );

  const firstName = useMemo(() => {
    if (!userName) return "";
    return userName.trim().split(" ")[0];
  }, [userName]);

  const selectedCategoryLabel =
    CATEGORY_OPTIONS.find((item) => item.value === category)?.label || "Categoria";

  const visibilityConfig = getVisibilityConfig(visibility);
  const VisibilityIcon = visibilityConfig.icon;

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);

    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!videoFile) {
      setVideoPreview(null);
      return;
    }

    const url = URL.createObjectURL(videoFile);
    setVideoPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setImageFile(file);
  }

  function handleVideoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setVideoFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!content.trim() && !imageFile && !videoFile) {
      alert("Escreva algo ou adicione uma imagem/vídeo antes de publicar.");
      return;
    }

    await onSubmit({
      content: content.trim(),
      category,
      visibility,
      imageFile,
      videoFile,
    });

    setContent("");
    setCategory("cotidiano");
    setVisibility("public");
    setImageFile(null);
    setVideoFile(null);
    setImagePreview(null);
    setVideoPreview(null);
    setOpenPanel(null);

    if (imageInputRef.current) imageInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[28px] border border-zinc-200 bg-white p-4 shadow-sm transition-colors dark:border-zinc-800 dark:bg-zinc-950 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {userAvatarUrl ? (
            <img
              src={userAvatarUrl}
              alt={userName || "Usuário"}
              className="h-12 w-12 rounded-full object-cover border border-zinc-200 dark:border-zinc-800"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              {getInitials(userName)}
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 transition-colors focus-within:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/70 dark:focus-within:border-zinc-600">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder={
                firstName
                  ? `No que você está pensando, ${firstName}?`
                  : "No que você está pensando?"
              }
              className="min-h-[88px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500 sm:text-base"
            />
          </div>
        </div>
      </div>

      {(imagePreview || videoPreview) && (
        <div className="mt-4 grid gap-3">
          {imagePreview && (
            <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  setImagePreview(null);
                  if (imageInputRef.current) imageInputRef.current.value = "";
                }}
                className="absolute right-3 top-3 z-10 rounded-full bg-black/70 p-1 text-white transition hover:bg-black"
              >
                <X className="h-4 w-4" />
              </button>

              <img
                src={imagePreview}
                alt="Pré-visualização da imagem"
                className="max-h-[360px] w-full object-cover"
              />
            </div>
          )}

          {videoPreview && (
            <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setVideoFile(null);
                  setVideoPreview(null);
                  if (videoInputRef.current) videoInputRef.current.value = "";
                }}
                className="absolute right-3 top-3 z-10 rounded-full bg-black/70 p-1 text-white transition hover:bg-black"
              >
                <X className="h-4 w-4" />
              </button>

              <video
                src={videoPreview}
                controls
                className="max-h-[420px] w-full bg-black"
              />
            </div>
          )}
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={handleImageChange}
        className="hidden"
      />

      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/ogg"
        onChange={handleVideoChange}
        className="hidden"
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <IconActionButton
          tooltip="Adicionar imagem"
          onClick={() => imageInputRef.current?.click()}
        >
          <ImagePlus className="h-5 w-5 text-emerald-500" />
        </IconActionButton>

        <IconActionButton
          tooltip="Adicionar vídeo"
          onClick={() => videoInputRef.current?.click()}
        >
          <Video className="h-5 w-5 text-pink-500" />
        </IconActionButton>

        <IconActionButton
          tooltip="Escolher categoria"
          active={openPanel === "category"}
          onClick={() =>
            setOpenPanel((prev) => (prev === "category" ? null : "category"))
          }
        >
          <Tag className="h-5 w-5 text-amber-500" />
        </IconActionButton>

        <IconActionButton
          tooltip="Definir privacidade"
          active={openPanel === "visibility"}
          onClick={() =>
            setOpenPanel((prev) => (prev === "visibility" ? null : "visibility"))
          }
        >
          <VisibilityIcon className="h-5 w-5 text-sky-500" />
        </IconActionButton>
      </div>

      {openPanel === "category" && (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Categoria
          </p>

          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setCategory(item.value);
                  setOpenPanel(null);
                }}
                className={[
                  "rounded-full border px-3 py-2 text-sm transition",
                  category === item.value
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-black"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {openPanel === "visibility" && (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Privacidade
          </p>

          <div className="flex flex-wrap gap-2">
            {VISIBILITY_OPTIONS.map((item) => {
              const config = getVisibilityConfig(item.value);
              const Icon = config.icon;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setVisibility(item.value);
                    setOpenPanel(null);
                  }}
                  className={[
                    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition",
                    visibility === item.value
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-black"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <SmallChip>
            <Tag className="h-3.5 w-3.5" />
            <span>{selectedCategoryLabel}</span>
          </SmallChip>

          <SmallChip>
            <VisibilityIcon className="h-3.5 w-3.5" />
            <span>{visibilityConfig.label}</span>
          </SmallChip>

          {imageFile && (
            <SmallChip
              onRemove={() => {
                setImageFile(null);
                setImagePreview(null);
                if (imageInputRef.current) imageInputRef.current.value = "";
              }}
            >
              <ImagePlus className="h-3.5 w-3.5 text-emerald-500" />
              <span className="max-w-[140px] truncate">{imageFile.name}</span>
            </SmallChip>
          )}

          {videoFile && (
            <SmallChip
              onRemove={() => {
                setVideoFile(null);
                setVideoPreview(null);
                if (videoInputRef.current) videoInputRef.current.value = "";
              }}
            >
              <Video className="h-3.5 w-3.5 text-pink-500" />
              <span className="max-w-[140px] truncate">{videoFile.name}</span>
            </SmallChip>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-w-[130px] items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black"
        >
          <SendHorizontal className="h-4 w-4" />
          {submitting ? "Publicando..." : "Publicar"}
        </button>
      </div>
    </form>
  );
}