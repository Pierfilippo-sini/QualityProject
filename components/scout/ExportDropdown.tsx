"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportCompaniesToExcel } from "@/lib/export/excel";
import { exportCompaniesToCsv } from "@/lib/export/csv";
import { useScoutStore } from "@/lib/store";

/**
 * Menu di esportazione client-side (Excel .xlsx a 5 Schede e CSV RFC-4180)
 * alimentato esclusivamente dai dati già presenti in memoria (0 chiamate API).
 */
export function ExportDropdown() {
  const companies = useScoutStore((s) => s.companies);
  const hasResults = companies.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="default" disabled={!hasResults}>
          <Download className="mr-1.5 size-4" />
          Esporta ({companies.length})
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          Export in memoria (0 chiamate API)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => exportCompaniesToExcel(companies)}>
          <FileSpreadsheet className="mr-2 size-4 text-emerald-600" />
          Excel 5 Schede CXI (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportCompaniesToCsv(companies)}>
          <FileText className="mr-2 size-4 text-sky-600" />
          Tabella Completa (.csv)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
