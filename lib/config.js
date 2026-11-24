// Business details and the job list. Edit this file to change prices, hours or phone.
module.exports = {
  name: "DIY Guy",
  email: "info@diy-guy.co.uk",
  baseUrl: process.env.BASE_URL || "https://diy-guy.co.uk",
  hours: "Mon to Fri, 9am to 5pm",
  services: [
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
