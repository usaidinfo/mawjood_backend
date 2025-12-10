# PowerShell script to run the migration SQL
# Make sure you have MySQL command line tools installed

$mysqlHost = "193.203.184.6"
$mysqlUser = Read-Host "Enter MySQL username"
$mysqlPass = Read-Host "Enter MySQL password" -AsSecureString
$mysqlDb = "u974605539_mj"
$mysqlPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($mysqlPass))

$migrationFile = "prisma\migrations\20250120000000_add_tourist_places\migration.sql"

Write-Host "Running migration SQL..."
& mysql -h $mysqlHost -u $mysqlUser -p$mysqlPassPlain $mysqlDb -e "source $migrationFile"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Migration executed successfully!" -ForegroundColor Green
    Write-Host "Now run: npx prisma migrate resolve --applied 20250120000000_add_tourist_places"
    Write-Host "Then run: npx prisma generate"
} else {
    Write-Host "Migration failed. Please check the error above." -ForegroundColor Red
}

