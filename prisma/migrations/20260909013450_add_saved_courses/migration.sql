-- CreateTable
CREATE TABLE "SavedCourse" (
    "id" BIGSERIAL NOT NULL,
    "courseKey" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "filmingLocationId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "totalDistanceMeters" INTEGER NOT NULL,
    "totalDurationSeconds" INTEGER NOT NULL,
    "travelDurationSeconds" INTEGER,
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedCoursePlace" (
    "id" BIGSERIAL NOT NULL,
    "savedCourseId" BIGINT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT,
    "overview" TEXT,
    "homepageUrl" TEXT,
    "arrivalTime" TEXT,
    "category" TEXT,
    "distanceFromPrevMeters" INTEGER,
    "durationFromPrevSeconds" INTEGER,

    CONSTRAINT "SavedCoursePlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedCourse_userId_idx" ON "SavedCourse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCourse_userId_courseKey_key" ON "SavedCourse"("userId", "courseKey");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCoursePlace_savedCourseId_order_key" ON "SavedCoursePlace"("savedCourseId", "order");

-- AddForeignKey
ALTER TABLE "SavedCourse" ADD CONSTRAINT "SavedCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCourse" ADD CONSTRAINT "SavedCourse_filmingLocationId_fkey" FOREIGN KEY ("filmingLocationId") REFERENCES "FilmingLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCoursePlace" ADD CONSTRAINT "SavedCoursePlace_savedCourseId_fkey" FOREIGN KEY ("savedCourseId") REFERENCES "SavedCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
