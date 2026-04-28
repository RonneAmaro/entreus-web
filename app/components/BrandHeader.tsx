import Image from "next/image";

type BrandHeaderProps = {
  size?: "small" | "medium" | "large";
  showSlogan?: boolean;
};

export default function BrandHeader({
  size = "medium",
  showSlogan = true,
}: BrandHeaderProps) {
  const logoSize =
    size === "small" ? 70 :
    size === "medium" ? 95 :
    120;

  return (
    <div className="flex flex-col items-center justify-center">
      <Image
        src="/logo.png"
        alt="Logo EntreUS"
        width={logoSize}
        height={logoSize}
        priority
        className="object-contain"
      />

      {showSlogan && (
        <span className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-300">
          Só Entre Nós
        </span>
      )}
    </div>
  );
}