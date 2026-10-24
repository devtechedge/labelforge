/*
  Warnings:

  - Added the required column `sourceOrder` to the `ReleaseItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ReleaseItem" ADD COLUMN     "sourceOrder" INTEGER NOT NULL;
