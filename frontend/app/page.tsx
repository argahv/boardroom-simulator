import { redirect } from "next/navigation";

// Simulations is the home: it lists runs and launches templates.
export default function Home() {
  redirect("/simulate");
}
