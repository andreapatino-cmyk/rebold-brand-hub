export function RLogo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg gradient-primary glow-primary font-display font-bold text-primary-foreground"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      R
    </div>
  );
}
