# MetrixIQ — Windows

This archive is FLAT: `package.json`, `app`, `components`, and `START-HERE.bat` are directly in the extracted folder.

## Simplest start
Double-click `START-HERE.bat`.

## PowerShell
Open PowerShell in this exact extracted folder and run:

```powershell
npm install
npm run dev
```

Then open `http://localhost:3000`.

If `npm run dev` ever says `Missing script: dev`, run `dir package.json`. If it cannot find that file, you are not in the project folder.
