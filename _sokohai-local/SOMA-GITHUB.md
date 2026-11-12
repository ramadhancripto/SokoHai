# Kusukuma kazi ya SokoHai kwenda GitHub

Kilichomo kwenye folda hii (`_sokohai-local`):

- `sokohai-remediation.bundle` — commits zote 29 za tawi `remediation/audit-findings-2026-11`
  (kutoka `bc3d147` hadi `0345acd`, faili 276).
- `SUKUMA-GITHUB.bat` — bofya mara mbili. Inaleta commits kwenye repo yako, inakuonyesha
  commit ya juu na remote, kisha **inakuuliza** kabla ya kusukuma tawi hilo GitHub.

Haigusi `main` na haifanyi merge. Baada ya push, fungua Pull Request kwenye GitHub.

Kwa mkono (Git Bash / CMD ndani ya folda ya repo):

    git fetch _sokohai-local/sokohai-remediation.bundle "+refs/heads/remediation/audit-findings-2026-11:refs/remotes/sokohai-bundle/remediation"
    git push -u origin refs/remotes/sokohai-bundle/remediation:refs/heads/remediation/audit-findings-2026-11
