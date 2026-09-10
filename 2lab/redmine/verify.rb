require 'json'
project = Project.find_by!(identifier: 'supermarket-36')
field = IssueCustomField.find_by!(name: 'External ID')
keys = project.issues.joins(:custom_values).where(custom_values: {custom_field_id: field.id}).pluck('custom_values.value')
raise 'Wrong backlog' unless keys.sort == (1..15).map { |n| format('SM-%02d',n) }
raise 'Project must be private' if project.is_public?
raise 'Wrong member count' unless project.members.count == 3
raise 'Wrong theme' unless Setting.ui_theme == 'supermarket'
%w[student_a student_b student_c].each do |login|
  user = User.find_by!(login: login)
  raise 'Student has global admin access' if user.admin?
  raise 'Project access missing' unless user.allowed_to?(:view_issues, project)
end
new_status = IssueStatus.find_by!(name: 'Новая')
work_status = IssueStatus.find_by!(name: 'В работе')
closed = IssueStatus.find_by!(name: 'Закрыта')
review = IssueStatus.find_by!(name: 'На проверке')
['Руководитель проекта','Специалист по ИС','DevOps-инженер'].each do |name|
  role = Role.find_by!(name: name)
  project.trackers.each do |tracker|
    base = WorkflowTransition.where(role_id: role.id, tracker_id: tracker.id)
    raise 'Forbidden shortcut to closed' if base.where(old_status_id: [new_status.id,work_status.id],new_status_id: closed.id).exists?
    raise 'Review transition missing' unless base.where(old_status_id: work_status.id,new_status_id: review.id).exists?
  end
end
task = project.issues.joins(:custom_values).find_by!(custom_values: {custom_field_id: field.id,value: 'SM-15'})
raise 'Individual task assigned incorrectly' unless task.assigned_to.login == 'student_a'
puts JSON.pretty_generate({result:'PASS',project:project.identifier,issues:keys.size,members:project.members.count,
  trackers:project.trackers.pluck(:name),relations:IssueRelation.where(issue_from_id:project.issues.select(:id)).count,
  theme:Setting.ui_theme,checks:['private project','3 non-admin participants','15 unique task keys','workflow forbids direct close','LR4 assigned to Roman']})
