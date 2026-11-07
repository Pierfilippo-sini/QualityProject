import { redirect } from "next/navigation";

/**
 * Reindirizza alla pagina di login definitiva `/login`.
 */
export default function LoginNewRedirectPage() {
  redirect("/login");
}
