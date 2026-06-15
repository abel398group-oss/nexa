-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'get_payment_status';
ALTER TYPE "ActionType" ADD VALUE 'cancel_payment';
ALTER TYPE "ActionType" ADD VALUE 'refund';
ALTER TYPE "ActionType" ADD VALUE 'cancel_subscription';
ALTER TYPE "ActionType" ADD VALUE 'delete_customer';
ALTER TYPE "ActionType" ADD VALUE 'alter_contract';
