import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center p-8 text-center">
      <p className="font-mono text-4xl font-semibold tracking-tight text-muted-foreground">404</p>
      <h1 className="mt-3 text-lg font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
        The page you are looking for does not exist or was removed.
      </p>
      <Link href="/dashboard" className="btn btn-primary mt-6">
        Back to dashboard
      </Link>
    </div>
  );
}
