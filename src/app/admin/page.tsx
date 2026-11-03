import type { Metadata } from "next";
import { AdminApp } from "@/client/admin/AdminApp";

export const metadata: Metadata = { title: "GMEP 보고서 작성기 관리" };

export default function AdminPage() {
  return <AdminApp />;
}
