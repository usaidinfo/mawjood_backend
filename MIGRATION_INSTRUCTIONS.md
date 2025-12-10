# How to Run the Tourist Places Migration

## ⚠️ IMPORTANT: The tables don't exist yet!

You need to run the migration SQL manually because Prisma Migrate requires shadow database permissions that you don't have.

## Step 1: Run the SQL Migration

### Option A: Using phpMyAdmin (Easiest)

1. Open phpMyAdmin: http://your-phpmyadmin-url
2. Select database: `u974605539_mj`
3. Click on the **SQL** tab
4. Open the file: `mawjood-backend/prisma/migrations/20250120000000_add_tourist_places/migration.sql`
5. Copy the **entire content** of the file
6. Paste it into the SQL textarea in phpMyAdmin
7. Click **Go** or **Execute**

### Option B: Using MySQL Command Line

```bash
# Navigate to backend directory
cd mawjood-backend

# Run the migration SQL
mysql -h 193.203.184.6 -u YOUR_USERNAME -p u974605539_mj < prisma/migrations/20250120000000_add_tourist_places/migration.sql
```

### Option C: Using MySQL Workbench

1. Open MySQL Workbench
2. Connect to your database
3. Select database: `u974605539_mj`
4. Go to File → Open SQL Script
5. Select: `mawjood-backend/prisma/migrations/20250120000000_add_tourist_places/migration.sql`
6. Click the Execute button (⚡)

## Step 2: Verify Tables Were Created

After running the SQL, verify the tables exist:

```sql
SHOW TABLES LIKE 'TouristPlace%';
```

You should see:
- `TouristPlace`
- `TouristPlaceAttraction`
- `TouristPlaceBusinessSection`

## Step 3: Mark Migration as Applied

After successfully running the SQL:

```powershell
cd mawjood-backend
npx prisma migrate resolve --applied 20250120000000_add_tourist_places
```

## Step 4: Regenerate Prisma Client

```powershell
cd mawjood-backend
npx prisma generate
```

**Note:** You may need to stop your backend server before running `prisma generate` if you get file lock errors.

## Step 5: Restart Backend Server

Restart your backend server to load the new Prisma client.

## Troubleshooting

### Error: "Table already exists"
If you get this error, the tables might already exist. Check with:
```sql
SHOW TABLES LIKE 'TouristPlace%';
```

If they exist, skip Step 1 and go directly to Step 3.

### Error: "Access denied"
Make sure you're using the correct MySQL credentials and have CREATE TABLE permissions.

### Error: "Foreign key constraint fails"
Make sure the `City` and `User` tables exist in your database.

## Quick Copy-Paste SQL

If you just want to copy-paste quickly, here's the SQL:

```sql
-- TouristPlace table
CREATE TABLE `TouristPlace` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `subtitle` VARCHAR(191) NULL,
  `galleryImages` JSON NULL,
  `about` LONGTEXT NULL,
  `metaTitle` VARCHAR(191) NULL,
  `metaDescription` TEXT NULL,
  `keywords` JSON NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `cityId` VARCHAR(191) NOT NULL,
  `bestTimeToVisit` JSON NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `TouristPlace_slug_key` (`slug`),
  INDEX `TouristPlace_slug_idx` (`slug`),
  INDEX `TouristPlace_cityId_idx` (`cityId`),
  INDEX `TouristPlace_isActive_idx` (`isActive`),
  CONSTRAINT `TouristPlace_cityId_fkey`
    FOREIGN KEY (`cityId`) REFERENCES `City`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `TouristPlace_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- TouristPlaceAttraction table
CREATE TABLE `TouristPlaceAttraction` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `image` VARCHAR(191) NOT NULL,
  `rating` DOUBLE NULL DEFAULT 0,
  `description` TEXT NULL,
  `openTime` VARCHAR(191) NULL,
  `closeTime` VARCHAR(191) NULL,
  `status` VARCHAR(191) NULL,
  `order` INTEGER NOT NULL DEFAULT 0,
  `touristPlaceId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `TouristPlaceAttraction_touristPlaceId_order_idx` (`touristPlaceId`, `order`),
  CONSTRAINT `TouristPlaceAttraction_touristPlaceId_fkey`
    FOREIGN KEY (`touristPlaceId`) REFERENCES `TouristPlace`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- TouristPlaceBusinessSection table
CREATE TABLE `TouristPlaceBusinessSection` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `categoryIds` JSON NOT NULL,
  `order` INTEGER NOT NULL DEFAULT 0,
  `touristPlaceId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `TouristPlaceBusinessSection_touristPlaceId_order_idx` (`touristPlaceId`, `order`),
  CONSTRAINT `TouristPlaceBusinessSection_touristPlaceId_fkey`
    FOREIGN KEY (`touristPlaceId`) REFERENCES `TouristPlace`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
);
```

