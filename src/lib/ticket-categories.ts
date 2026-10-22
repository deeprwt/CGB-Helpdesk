/* -----------------------------------
   Category → Sub Category Map (FULL)
   Shared by the New Ticket form and the AskMira connection, which offers
   the same choices when someone raises a ticket from the HRMS.
----------------------------------- */
export const CATEGORY_MAP: Record<string, string[]> = {
  "Access & Identity": [
    "Password Reset",
    "Account Locked",
    "New User Access",
    "Role / Permission Change",
    "SSO Login Issues",
  ],
  Hardware: [
    "Laptop Issue",
    "Desktop Issue",
    "Monitor",
    "Keyboard / Mouse",
    "Printer / Scanner",
    "Hardware Replacement",
  ],
  "Software / Applications": [
    "Application Not Working",
    "Software Installation Request",
    "License Request",
    "Update / Patch Issue",
    "Compatibility Issue",
    "Internal / Custom Application",
  ],
  "Network & Connectivity": [
    "No Internet",
    "VPN Issues",
    "Wi-Fi Slow / Unstable",
    "LAN Issue",
    "Firewall / Port Access Request",
    "DNS Issue",
  ],
  "Email & Collaboration": [
    "Email Not Sending / Receiving",
    "Mailbox Full",
    "Outlook / Gmail Issues",
    "Teams / Slack Issues",
    "Calendar / Meeting Issue",
    "Shared Mailbox Access",
  ],
  Security: [
    "Phishing / Suspicious Email",
    "Malware / Virus",
    "Device Compromised",
    "Security Access Request",
    "Data Loss Incident",
    "Policy Violation",
  ],
  Database: [
    "Database Down",
    "Query Performance Issue",
    "Database Access Request",
    "Backup / Restore",
  ],
  "Service Requests": [
    "New Laptop Request",
    "Software Installation",
    "VPN Access",
    "Email Group Creation",
  ],
}

export const PRIORITIES = ["low", "medium", "high"] as const
