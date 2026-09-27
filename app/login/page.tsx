import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="wrap" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ width: "100%", maxWidth: 360 }}>
        <LoginForm />
      </div>
    </main>
  );
}
