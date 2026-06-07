-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'vendedor';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "seller_id" TEXT;
