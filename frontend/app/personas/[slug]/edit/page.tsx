import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ slug: string }> };

// Personas are edited in place on their page; this keeps old links and bookmarks working.
export default async function EditPersonaRedirect({ params }: PageProps) {
  const { slug } = await params;
  redirect(`/personas/${encodeURIComponent(slug)}`);
}
