// Business details and the job list. Edit this file to change prices, hours or phone.
module.exports = {
  name: "DIY Guy",
  email: "info@diy-guy.co.uk",
  baseUrl: process.env.BASE_URL || "https://diy-guy.co.uk",
  hours: "Mon to Fri, 9am to 5pm",
  // Services with "slots" have no price and fixed times: [start hour, hours blocked].
  // "arrive" replaces the time shown to customers. "featured" shows them highlighted at the top.
  services: [
    { id: "install", name: "Full Water Softener Install", slots: [[9, 8]], arrive: "Arrive 9am to 11am", featured: true },
    { id: "softener", name: "Water Softener Swap Out", slots: [[9, 2], [11, 2], [13, 2]], featured: true },
    { id: "home", name: "Home DIY", rate: 40 },
    { id: "garden", name: "Garden Maintenance", rate: 30 },
    { id: "tech", name: "Tech Help", rate: 50 }
  ],
  durations: [1, 2],      // one and two hour time slots
  openHour: 9,            // first start time
  closeHour: 17,          // a job must finish by this hour
  openDays: [1, 2, 3, 4, 5], // 0 = Sunday ... 6 = Saturday
  daysAhead: 28,          // how many days ahead customers can book
  minNoticeMinutes: 120   // a slot must start at least this far away today
};
