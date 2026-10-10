import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main
      className="wrap login"
      style={{
        paddingTop: "max(var(--space-3), env(safe-area-inset-top))",
        paddingBottom: "max(var(--space-3), env(safe-area-inset-bottom))",
      }}
    >
      <div className="card login__card">
        <LoginForm />
      </div>
    </main>
  );
}
